import 'server-only';
import { marketData, catalogEntry, type CatalogEntry } from '@/lib/market';
import type { AssetSummary } from '@/components/market/asset-card';

/**
 * Turning catalogue entries into something a card can render.
 *
 * Quotes and sparkline history are fetched together and in parallel, because a
 * discovery page showing twenty instruments would otherwise make forty sequential
 * round trips. Anything a source cannot answer comes back null and renders as
 * "no price" — never as zero, and never as an estimate.
 */
export async function summarise(entries: CatalogEntry[], withSparkline = true): Promise<AssetSummary[]> {
  const source = marketData();
  const symbols = entries.map((e) => e.symbol);

  const [quotes, sparks] = await Promise.all([
    source.quotes(symbols),
    withSparkline
      ? Promise.all(symbols.map(async (s) => [s, await source.history(s, '1M')] as const))
      : Promise.resolve([] as const),
  ]);

  const sparkBySymbol = new Map(
    (sparks as readonly (readonly [string, Awaited<ReturnType<typeof source.history>>])[])
      .map(([symbol, history]) => [
        symbol.toUpperCase(),
        (history?.candles ?? []).map((c) => Number(c.closeMinor) / 100),
      ]),
  );

  return entries.map((entry) => {
    const quote = quotes.get(entry.symbol.toUpperCase());
    return {
      symbol: entry.symbol,
      name: entry.name,
      kind: entry.kind,
      exchange: entry.exchange,
      priceMinor: quote ? Number(quote.priceMinor) : null,
      currency: quote?.currency ?? entry.currency,
      changeBps: quote?.changeBps ?? null,
      spark: sparkBySymbol.get(entry.symbol.toUpperCase()) ?? [],
      simulated: quote?.simulated ?? !source.live,
      expenseRatioBps: entry.expenseRatioBps ?? null,
      tracks: entry.tracks ?? null,
      sector: entry.sector ?? null,
    };
  });
}

/** The same, for a list of bare symbols (a watchlist, a portfolio). */
export async function summariseSymbols(symbols: string[]): Promise<AssetSummary[]> {
  const entries = symbols
    .map((s) => catalogEntry(s) ?? fallbackEntry(s))
    .filter((e): e is CatalogEntry => e !== null);
  return summarise(entries);
}

/**
 * A minimal entry for a symbol that is not in the catalogue.
 *
 * With a real provider connected, people can follow instruments this app has never
 * heard of. They should still render, just with less context around them.
 */
function fallbackEntry(symbol: string): CatalogEntry {
  return {
    symbol: symbol.toUpperCase(),
    name: symbol.toUpperCase(),
    kind: 'stock',
    exchange: '',
    currency: 'USD',
    collections: [],
  };
}

export function sourceInfo(): { label: string; live: boolean } {
  const source = marketData();
  return { label: source.label, live: source.live };
}

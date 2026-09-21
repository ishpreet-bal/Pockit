import 'server-only';
import { catalogEntry } from './catalog';
import type {
  AssetProfile, Fundamentals, History, HistoryRange, MarketDataSource, NewsItem, Quote,
} from './types';

/**
 * Finnhub, on its free tier.
 *
 * The free plan covers quotes, company profiles, basic financials and news, but NOT
 * historical candles — those are a paid endpoint. This adapter therefore returns
 * null from `history` when the plan refuses it, and the UI shows the chart as
 * unavailable rather than drawing an invented line. A chart is the easiest place to
 * quietly fabricate data, so it is the place to be strictest.
 */
export class FinnhubSource implements MarketDataSource {
  readonly id = 'finnhub';
  readonly label = 'Finnhub';
  readonly live = true;

  constructor(private readonly apiKey: string) {}

  private async get<T>(path: string, revalidate: number): Promise<T | null> {
    try {
      const sep = path.includes('?') ? '&' : '?';
      const res = await fetch(`https://finnhub.io/api/v1${path}${sep}token=${this.apiKey}`, {
        next: { revalidate },
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  private now(): string {
    return new Date().toISOString();
  }

  async quote(symbol: string): Promise<Quote | null> {
    const entry = catalogEntry(symbol);
    const data = await this.get<{
      c: number; d: number | null; dp: number | null; pc: number | null;
      h: number | null; l: number | null; t: number;
    }>(`/quote?symbol=${encodeURIComponent(finnhubSymbol(symbol))}`, 60);

    // Finnhub answers an unknown symbol with c: 0 rather than an error.
    if (!data || !data.c) return null;

    const money = (v: number | null | undefined) =>
      v === null || v === undefined ? null : BigInt(Math.round(v * 100));

    return {
      symbol: symbol.toUpperCase(),
      priceMinor: BigInt(Math.round(data.c * 100)),
      currency: entry?.currency ?? 'USD',
      changeMinor: money(data.d),
      changeBps: data.dp === null || data.dp === undefined ? null : Math.round(data.dp * 100),
      previousCloseMinor: money(data.pc),
      dayHighMinor: money(data.h),
      dayLowMinor: money(data.l),
      source: this.label,
      asOf: new Date((data.t || Date.now() / 1000) * 1000).toISOString(),
      simulated: false,
    };
  }

  async quotes(symbols: string[]): Promise<Map<string, Quote>> {
    // No batch endpoint on the free tier, so these go in parallel and any failure
    // drops out of the map rather than failing the whole request.
    const results = await Promise.all(symbols.map(async (s) => [s, await this.quote(s)] as const));
    const out = new Map<string, Quote>();
    for (const [symbol, quote] of results) if (quote) out.set(symbol.toUpperCase(), quote);
    return out;
  }

  async history(symbol: string, range: HistoryRange): Promise<History | null> {
    const { from, to, resolution } = rangeToWindow(range);
    const entry = catalogEntry(symbol);
    const isCrypto = entry?.kind === 'crypto';
    const path = isCrypto
      ? `/crypto/candle?symbol=BINANCE:${symbol.toUpperCase()}USDT&resolution=${resolution}&from=${from}&to=${to}`
      : `/stock/candle?symbol=${encodeURIComponent(finnhubSymbol(symbol))}&resolution=${resolution}&from=${from}&to=${to}`;

    const data = await this.get<{ s: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[] }>(path, 300);

    // 's' is "ok" or "no_data"; a 403 from the plan comes back as null above. Either
    // way there is no history to draw, and saying so beats drawing something else.
    if (!data || data.s !== 'ok' || !data.t?.length) return null;

    const candles = data.t.map((t, i) => ({
      t: new Date(t * 1000).toISOString(),
      openMinor: BigInt(Math.round((data.o?.[i] ?? 0) * 100)),
      highMinor: BigInt(Math.round((data.h?.[i] ?? 0) * 100)),
      lowMinor: BigInt(Math.round((data.l?.[i] ?? 0) * 100)),
      closeMinor: BigInt(Math.round((data.c?.[i] ?? 0) * 100)),
      volume: data.v?.[i] ?? null,
    }));

    return {
      symbol: symbol.toUpperCase(),
      range,
      currency: entry?.currency ?? 'USD',
      candles,
      source: this.label,
      asOf: this.now(),
      simulated: false,
    };
  }

  async profile(symbol: string): Promise<AssetProfile | null> {
    const entry = catalogEntry(symbol);
    const data = await this.get<{
      name?: string; exchange?: string; finnhubIndustry?: string; country?: string;
      weburl?: string; currency?: string;
    }>(`/stock/profile2?symbol=${encodeURIComponent(finnhubSymbol(symbol))}`, 86400);

    if (!data?.name && !entry) return null;

    return {
      symbol: symbol.toUpperCase(),
      name: data?.name ?? entry?.name ?? symbol.toUpperCase(),
      kind: entry?.kind ?? 'stock',
      exchange: data?.exchange ?? entry?.exchange ?? null,
      currency: data?.currency ?? entry?.currency ?? 'USD',
      description: null,
      sector: entry?.sector ?? null,
      industry: data?.finnhubIndustry ?? entry?.industry ?? null,
      country: data?.country ?? null,
      website: data?.weburl ?? null,
      expenseRatioBps: entry?.expenseRatioBps ?? null,
      tracks: entry?.tracks ?? null,
      assetClassNote: null,
    };
  }

  async fundamentals(symbol: string): Promise<Fundamentals | null> {
    const entry = catalogEntry(symbol);
    const data = await this.get<{ metric?: Record<string, number | null> }>(
      `/stock/metric?symbol=${encodeURIComponent(finnhubSymbol(symbol))}&metric=all`,
      3600,
    );
    const m = data?.metric;
    if (!m) return null;

    const money = (v: number | null | undefined) =>
      v === null || v === undefined ? null : BigInt(Math.round(v * 100));

    return {
      symbol: symbol.toUpperCase(),
      // Finnhub reports market cap in millions of the listing currency.
      marketCapMinor: m.marketCapitalization ? BigInt(Math.round(m.marketCapitalization * 1_000_000 * 100)) : null,
      peRatio: m.peTTM ?? m.peBasicExclExtraTTM ?? null,
      epsMinor: money(m.epsTTM ?? m.epsBasicExclExtraItemsTTM),
      revenueMinor: m.revenuePerShareTTM && m.marketCapitalization ? null : null,
      profitMarginPct: m.netProfitMarginTTM ?? null,
      dividendYieldBps: m.dividendYieldIndicatedAnnual ? Math.round(m.dividendYieldIndicatedAnnual * 100) : null,
      week52HighMinor: money(m['52WeekHigh']),
      week52LowMinor: money(m['52WeekLow']),
      volume: m.volume ?? null,
      averageVolume: m['10DayAverageTradingVolume'] ? m['10DayAverageTradingVolume'] * 1_000_000 : null,
      beta: m.beta ?? null,
      currency: entry?.currency ?? 'USD',
      source: this.label,
      asOf: new Date().toISOString(),
      simulated: false,
    };
  }

  async news(symbol: string, limit = 6): Promise<NewsItem[]> {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const data = await this.get<{ id: number; headline: string; summary: string; url: string; source: string; datetime: number }[]>(
      `/company-news?symbol=${encodeURIComponent(finnhubSymbol(symbol))}&from=${iso(from)}&to=${iso(to)}`,
      900,
    );
    return (data ?? []).slice(0, limit).map((n) => ({
      id: String(n.id),
      headline: n.headline,
      summary: n.summary || null,
      url: n.url,
      source: n.source,
      publishedAt: new Date(n.datetime * 1000).toISOString(),
    }));
  }
}

/**
 * Our catalogue uses the suffixed form for non-US listings ("RY.TO"), which is also
 * what Finnhub expects, so this is currently identity — but it is the one place to
 * change if a provider wants a different convention.
 */
function finnhubSymbol(symbol: string): string {
  return symbol.toUpperCase();
}

/** Seconds since epoch, and the candle resolution, for a requested range. */
function rangeToWindow(range: HistoryRange): { from: number; to: number; resolution: string } {
  const to = Math.floor(Date.now() / 1000);
  const day = 86_400;
  switch (range) {
    case '1D': return { from: to - 2 * day, to, resolution: '5' };
    case '5D': return { from: to - 7 * day, to, resolution: '30' };
    case '1M': return { from: to - 31 * day, to, resolution: 'D' };
    case '6M': return { from: to - 183 * day, to, resolution: 'D' };
    case 'YTD': {
      const jan = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
      return { from: Math.floor(jan), to, resolution: 'D' };
    }
    case '1Y': return { from: to - 366 * day, to, resolution: 'D' };
    case '5Y': return { from: to - 5 * 366 * day, to, resolution: 'W' };
    case 'MAX': return { from: to - 20 * 366 * day, to, resolution: 'M' };
  }
}

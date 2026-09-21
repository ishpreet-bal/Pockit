import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAuth } from '@/lib/auth/guard';
import { marketData, catalogEntry } from '@/lib/market';
import { Card, EmptyState, LinkButton } from '@/components/ui/primitives';
import { CompareView, type CompareSeries } from './compare-view';

export const metadata: Metadata = { title: 'Compare' };
export const dynamic = 'force-dynamic';

/**
 * Comparing instruments.
 *
 * Normalised to percentage change from the start of the window rather than plotted
 * at their raw prices: a $500 fund and a $30 fund on one price axis tells you only
 * which has the bigger number. Rebasing to zero is the only comparison that means
 * anything across different prices.
 */
export default async function ComparePage({
  searchParams,
}: { searchParams: Promise<{ symbols?: string }> }) {
  await requireAuth();
  const params = await searchParams;
  const symbols = (params.symbols ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 4);

  if (symbols.length < 2) {
    return (
      <Card>
        <EmptyState
          title="Pick at least two"
          description="Select instruments with the + button on any card, then choose Compare. Up to four at a time."
          action={<LinkButton href="/investing/etfs" variant="primary">Browse funds</LinkButton>}
        />
      </Card>
    );
  }

  const source = marketData();
  const results = await Promise.all(symbols.map(async (symbol) => {
    const [history, quote] = await Promise.all([source.history(symbol, '1Y'), source.quote(symbol)]);
    const entry = catalogEntry(symbol);
    const candles = history?.candles ?? [];
    const first = candles[0] ? Number(candles[0].closeMinor) : 0;

    return {
      symbol,
      name: entry?.name ?? symbol,
      kind: entry?.kind ?? 'stock',
      currency: quote?.currency ?? entry?.currency ?? 'USD',
      priceMinor: quote ? Number(quote.priceMinor) : null,
      changeBps: quote?.changeBps ?? null,
      expenseRatioBps: entry?.expenseRatioBps ?? null,
      tracks: entry?.tracks ?? null,
      sector: entry?.sector ?? null,
      // Rebased so every series starts at 0%.
      points: first > 0
        ? candles.map((c) => ({
            t: c.t.slice(0, 10),
            pct: ((Number(c.closeMinor) - first) / first) * 100,
          }))
        : [],
    } satisfies CompareSeries;
  }));

  const kinds = new Set(results.map((r) => r.kind));

  return (
    <div className="space-y-4">
      <Link href="/investing/etfs" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to browsing
      </Link>

      {kinds.size > 1 ? (
        <div className="rounded-[var(--radius-card)] bg-[var(--warning-soft)] px-4 py-3 text-sm">
          <strong>You are comparing different kinds of instrument.</strong>{' '}
          <span className="text-[var(--text-muted)]">
            The performance line is still comparable, but the metrics below are not: an expense ratio
            means nothing for a single company, and a sector means nothing for a fund. Those cells are
            left blank rather than filled with something that does not apply.
          </span>
        </div>
      ) : null}

      <CompareView series={results} sourceLabel={source.label} live={source.live} />
    </div>
  );
}

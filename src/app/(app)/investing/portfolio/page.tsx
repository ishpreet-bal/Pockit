import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/guard';
import { withUser } from '@/lib/db/client';
import { holdings } from '@/lib/db/schema';
import { Card, CardBody, CardHeader, EmptyState, LinkButton } from '@/components/ui/primitives';
import { Change } from '@/components/market/change';
import { marketData, catalogEntry } from '@/lib/market';
import { valueHolding, totalHoldings } from '@/lib/investing/valuation';
import { formatMoney, sumMinor, toDecimalString } from '@/lib/money';
import { HoldingEditor } from './holding-editor';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Portfolio' };
export const dynamic = 'force-dynamic';

/**
 * What you actually own, valued against live prices where they exist.
 *
 * Unlike the watchlist, these are recorded positions. Matching real quotes can
 * update the displayed valuation; tracking records do not change cash balances.
 */
export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ currency?: string }> }) {
  const { user, workspace } = await requireAuth();
  const source = marketData();

  const rows = await withUser(user.id, (tx) =>
    tx.select().from(holdings).where(eq(holdings.workspaceId, workspace.id)),
  );

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No holdings tracked"
          description="Record investments here to track their value and cost. Tracking does not change account balances or post trades."
          action={<LinkButton href="/investing/watchlist">View watchlist</LinkButton>}
        />
        <CardBody><HoldingEditor currency={workspace.baseCurrency} /></CardBody>
      </Card>
    );
  }

  const symbols = rows.map((r) => r.symbol).filter((s): s is string => Boolean(s));
  const quotes = await source.quotes(symbols).catch(() => new Map());

  const positions = rows.map((row) => {
    const quote = row.symbol ? quotes.get(row.symbol.toUpperCase()) : undefined;
    // A live quote is preferred; the stored value is the fallback so a holding
    // without a tradeable symbol (a managed fund, a private asset) still counts.
    const valued = valueHolding(row, quote);
    return {
      ...valued,
      units: Number(row.quantity),
      changeBps: valued.changePct === null ? null : Math.round(valued.changePct * 100),
      priced: valued.valuation === 'quote',
      sector: row.symbol ? catalogEntry(row.symbol)?.sector ?? null : null,
      kind: row.symbol ? catalogEntry(row.symbol)?.kind ?? null : null,
    };
  });

  const totals = totalHoldings(positions);
  const requested = (await searchParams).currency;
  const cur = totals.find((t) => t.currency === requested)?.currency ?? totals.find((t) => t.currency === workspace.baseCurrency)?.currency ?? totals[0]!.currency;
  const selected = positions.filter((p) => p.currency === cur);
  const totalValue = sumMinor(selected.map((p) => p.valueMinor));
  const totalCost = sumMinor(selected.map((p) => p.costMinor));
  const totalGain = totalValue - totalCost;
  const returnBps = totalCost > 0n ? Number((totalGain * 10000n) / totalCost) : null;

  const byKind = groupShare(selected.map((p) => [p.kind ?? 'other', p.valueMinor] as const), totalValue);
  const bySector = groupShare(
    selected.filter((p) => p.kind === 'stock').map((p) => [p.sector ?? 'Other', p.valueMinor] as const),
    sumMinor(selected.filter((p) => p.kind === 'stock').map((p) => p.valueMinor)),
  );

  const largest = [...selected].sort((a, b) => (b.valueMinor > a.valueMinor ? 1 : -1))[0];
  const concentration = largest && totalValue > 0n
    ? Number((largest.valueMinor * 1000n) / totalValue) / 10
    : 0;

  return (
    <div className="space-y-5">
      <HoldingEditor currency={workspace.baseCurrency} />
      <div className="flex flex-wrap items-center gap-2">
        {totals.map((total) => <Link key={total.currency} href={`/investing/portfolio?currency=${total.currency}`} aria-current={cur === total.currency ? 'page' : undefined} className="rounded-full border border-[var(--border)] px-3 py-2 text-sm">{total.currency} · {formatMoney(total.valueMinor, total.currency)}</Link>)}
      </div>
      <p className="text-xs text-[var(--text-muted)]">Totals and mix below are for {cur} holdings. Currencies are kept separate; no exchange rate has been applied.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Value" value={formatMoney(totalValue, cur)} />
        <Stat label="Cost" value={formatMoney(totalCost, cur)} />
        <Stat
          label="Gain / loss"
          value={formatMoney(totalGain, cur)}
          tone={totalGain < 0n ? 'down' : totalGain > 0n ? 'up' : 'flat'}
        />
        <Stat label="Return" value={returnBps === null ? '—' : `${(returnBps / 100).toFixed(1)}%`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Holdings" description="Real quotes in the holding’s currency, otherwise the recorded value" />
          <CardBody className="overflow-x-auto px-0 pb-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-2xs uppercase tracking-wide text-[var(--text-subtle)]">
                  <th className="py-2 pl-5 pr-2 text-left font-medium">Holding</th>
                  <th className="px-2 py-2 text-right font-medium">Units</th>
                  <th className="px-2 py-2 text-right font-medium">Value</th>
                  <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Gain</th>
                  <th className="py-2 pl-2 pr-5 text-right font-medium">Today</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                    <td className="py-2.5 pl-5 pr-2">
                      {p.symbol ? (
                        <Link href={`/investing/${encodeURIComponent(p.symbol)}`} className="block">
                          <span className="pk-display block text-sm font-bold">{p.symbol}</span>
                          <span className="block truncate text-2xs text-[var(--text-muted)]">{p.name}</span>
                        </Link>
                      ) : (
                        <>
                          <span className="block text-sm font-medium">{p.name}</span>
                          <span className="block text-2xs text-[var(--text-subtle)]">not a listed symbol</span>
                        </>
                      )}
                    </td>
                    <td className="tabular px-2 py-2.5 text-right text-xs">{p.units.toLocaleString()}</td>
                    <td className="tabular px-2 py-2.5 text-right font-medium">{formatMoney(p.valueMinor, p.currency)}<span className="block text-2xs font-normal text-[var(--text-subtle)]">{p.currency} · {p.priced ? p.source : 'Recorded'}{p.asOf ? ` · ${p.asOf.slice(0, 10)}` : ''}</span></td>
                    <td className="tabular hidden px-2 py-2.5 text-right sm:table-cell">
                      <span className={p.gainMinor < 0n ? 'text-[var(--negative)]' : p.gainMinor > 0n ? 'text-[var(--positive)]' : ''}>
                        {formatMoney(p.gainMinor, p.currency)}
                      </span>
                    </td>
                    <td className="py-2.5 pl-2 pr-5 text-right"><Change bps={p.changeBps} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details className="p-4"><summary className="cursor-pointer text-sm font-medium">Manage recorded holdings</summary><div className="mt-3 space-y-3">{rows.map((row) => <div key={row.id}><p className="mb-1 text-xs text-[var(--text-muted)]">{row.name}</p><HoldingEditor currency={row.currency} holding={{ id: row.id, name: row.name, symbol: row.symbol ?? '', quantity: row.quantity, currency: row.currency, currentValue: toDecimalString(row.currentValueMinor, row.currency), costBasis: toDecimalString(row.costBasisMinor, row.currency) }} /></div>)}</div></details>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Mix" description="By instrument type" />
            <CardBody className="space-y-3">
              {byKind.map((g, i) => (
                <Bar key={g.label} label={g.label} pct={g.pct} index={i} />
              ))}
            </CardBody>
          </Card>

          {bySector.length > 0 ? (
            <Card>
              <CardHeader title="Sectors" description="Within your individual shares" />
              <CardBody className="space-y-3">
                {bySector.map((g, i) => <Bar key={g.label} label={g.label} pct={g.pct} index={i + 3} />)}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Concentration" />
            <CardBody>
              <p className="pk-figure text-2xl">{concentration.toFixed(0)}%</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                of your {cur} holdings sits in {largest?.symbol ?? largest?.name ?? 'one holding'}.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-subtle)]">
                {concentration >= 40
                  ? 'That is a large share in one place. It is a fact about your portfolio, not a judgement — but it does mean your result depends heavily on that one holding.'
                  : 'No single holding dominates. That is what diversification looks like in one number.'}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {positions.some((p) => !p.priced) ? (
        <p className="text-xs text-[var(--text-subtle)]">
          Some holdings could not be priced from the connected source and are shown at their last
          recorded value.
        </p>
      ) : null}
    </div>
  );
}

function groupShare(pairs: readonly (readonly [string, bigint])[], total: bigint) {
  const byKey = new Map<string, bigint>();
  for (const [key, value] of pairs) byKey.set(key, (byKey.get(key) ?? 0n) + value);
  return [...byKey.entries()]
    .map(([label, value]) => ({
      label: label === 'stock' ? 'Shares' : label === 'etf' ? 'Funds' : label === 'crypto' ? 'Crypto' : label,
      pct: total > 0n ? Number((value * 1000n) / total) / 10 : 0,
    }))
    .sort((a, b) => b.pct - a.pct);
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' | 'flat' }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <p className={`pk-figure mt-1.5 text-lg sm:text-xl ${
        tone === 'down' ? 'text-[var(--negative)]' : tone === 'up' ? 'text-[var(--positive)]' : ''
      }`}>
        {value}
      </p>
    </div>
  );
}

function Bar({ label, pct, index }: { label: string; pct: number; index: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate">{label}</span>
        <span className="tabular shrink-0 text-xs text-[var(--text-muted)]">{pct.toFixed(0)}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: `var(--chart-${(index % 8) + 1})` }} />
      </div>
    </div>
  );
}

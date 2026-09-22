import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { requireAuth } from '@/lib/auth/guard';
import { withUser } from '@/lib/db/client';
import { watchlistItems, holdings } from '@/lib/db/schema';
import { marketData, catalogEntry, CATALOG_REVIEWED } from '@/lib/market';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Change } from '@/components/market/change';
import { Provenance } from '@/components/market/provenance';
import { formatMoney } from '@/lib/money';
import { ChartPanel } from './chart-panel';
import { WatchButton } from './watch-button';
import { AskPockButton } from '@/components/brand/ask-pock-button';
import { listsFor } from '@/lib/investing/lists';
import { AiAnalysis } from './ai-analysis';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const { symbol } = await params;
  const entry = catalogEntry(symbol);
  return { title: entry ? `${entry.symbol} · ${entry.name}` : symbol.toUpperCase() };
}

const KIND_LABEL = { stock: 'Stock', etf: 'ETF', crypto: 'Cryptocurrency' } as const;

export default async function AssetPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  const { user, workspace } = await requireAuth();
  const source = marketData();

  const [profile, quote, history, fundamentals, news, watched, position] = await Promise.all([
    source.profile(symbol),
    source.quote(symbol),
    source.history(symbol, '1M'),
    source.fundamentals(symbol),
    source.news(symbol, 5),
    withUser(user.id, async (tx) => ({
      // Which LISTS hold this symbol, not merely whether one does: the follow control
      // offers the lists, so it has to know which are already ticked.
      on: await tx.select({ listId: watchlistItems.listId }).from(watchlistItems)
        .where(and(eq(watchlistItems.workspaceId, workspace.id), eq(watchlistItems.symbol, symbol))),
      lists: await listsFor(tx, workspace.id),
    })),
    withUser(user.id, (tx) =>
      tx.select().from(holdings)
        .where(and(eq(holdings.workspaceId, workspace.id), eq(holdings.symbol, symbol)))
        .limit(1),
    ),
  ]);

  // Nothing knows this instrument — a 404 is more honest than an empty shell.
  // Only a symbol NOTHING recognises is a 404. A rate-limited minute is not
  // evidence an instrument does not exist, and treating it as such is what sent
  // people to a blank black page for VOO.
  if (!profile && !quote && !catalogEntry(symbol)) notFound();

  const entry = catalogEntry(symbol);
  const currency = profile?.currency ?? quote?.currency ?? 'USD';
  const kind = profile?.kind ?? entry?.kind ?? 'stock';
  const held = position[0];

  return (
    <div className="space-y-5">
      <Link
        href={kind === 'etf' ? '/investing/etfs' : kind === 'crypto' ? '/investing/crypto' : '/investing/stocks'}
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to {kind === 'etf' ? 'ETFs' : kind === 'crypto' ? 'crypto' : 'stocks'}
      </Link>

      {/* Identity and price, together, because they are one thought. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="pk-display text-2xl font-bold tracking-tight">{symbol}</h2>
            <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-2xs font-medium text-[var(--text-muted)]">
              {KIND_LABEL[kind]}{profile?.exchange ? ` · ${profile.exchange}` : ''}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{profile?.name ?? entry?.name ?? symbol}</p>
        </div>
        <AskPockButton
          anchor={{ kind: 'symbol', id: symbol, label: symbol }}
          label={`Ask Pock about ${symbol}`}
          prompt={`What should I understand about ${symbol}?`}
        />
        <WatchButton
          symbol={symbol}
          name={profile?.name ?? symbol}
          lists={watched.lists.map((l) => ({ id: l.id, name: l.name }))}
          onLists={watched.on.map((r) => r.listId)}
        />
      </div>

      <Card>
        <CardBody className="pt-5">
          <ChartPanel
            symbol={symbol}
            currency={currency}
            initialRange="1M"
            sourceLabel={source.label}
            initial={{
              available: history !== null,
              simulated: history?.simulated ?? !source.live,
              asOf: history?.asOf ?? null,
              points: (history?.candles ?? []).map((c) => ({
                t: c.t,
                close: Number(c.closeMinor) / 100,
                open: Number(c.openMinor) / 100,
                high: Number(c.highMinor) / 100,
                low: Number(c.lowMinor) / 100,
              })),
            }}
          />
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {held ? (
            <Card>
              <CardHeader title="Your position" description="From the holdings you track in Pockit" />
              <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Figure label="Units" value={held.quantity} />
                <Figure label="Cost" value={formatMoney(BigInt(held.costBasisMinor as unknown as string), held.currency)} />
                <Figure label="Value" value={formatMoney(BigInt(held.currentValueMinor as unknown as string), held.currency)} />
                <Figure
                  label="Gain / loss"
                  value={formatMoney(
                    BigInt(held.currentValueMinor as unknown as string) - BigInt(held.costBasisMinor as unknown as string),
                    held.currency,
                  )}
                />
              </CardBody>
            </Card>
          ) : null}

          <AiAnalysis symbol={symbol} />

          <Card>
            <CardHeader title="News" description={source.live ? 'Recent coverage' : 'Needs a market-data key'} />
            <CardBody>
              {news.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  {source.live
                    ? 'No recent news from the connected source for this instrument.'
                    : 'News needs a real market-data source. Pockit will not invent headlines — connect a key and they appear here.'}
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {news.map((n) => (
                    <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                      <a href={n.url} target="_blank" rel="noopener noreferrer" className="group block">
                        <p className="text-sm font-medium group-hover:text-[var(--accent)]">
                          {n.headline}
                          <ExternalLink className="ml-1 inline h-3 w-3 align-baseline" />
                        </p>
                        <p className="mt-0.5 text-2xs text-[var(--text-subtle)]">
                          {n.source} · {new Date(n.publishedAt).toLocaleDateString(user.locale, { dateStyle: 'medium' })}
                        </p>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title={kind === 'etf' ? 'About this fund' : 'Key statistics'} />
            <CardBody className="space-y-2.5 text-sm">
              {kind === 'etf' ? (
                <>
                  <Row label="Tracks" value={profile?.tracks ?? entry?.tracks ?? '—'} />
                  <Row
                    label="Expense ratio"
                    value={profile?.expenseRatioBps != null ? `${(profile.expenseRatioBps / 100).toFixed(2)}% a year` : '—'}
                    note={profile?.expenseRatioBps != null ? `indicative, reviewed ${CATALOG_REVIEWED}` : undefined}
                  />
                  <Row label="Listed on" value={profile?.exchange ?? '—'} />
                  <Row label="Currency" value={currency} />
                </>
              ) : (
                <>
                  <Row label="Sector" value={profile?.sector ?? '—'} />
                  <Row label="Industry" value={profile?.industry ?? '—'} />
                  <Row
                    label="Market cap"
                    value={fundamentals?.marketCapMinor ? formatMoney(fundamentals.marketCapMinor, currency, { compact: true }) : '—'}
                  />
                  <Row label="P/E" value={fundamentals?.peRatio ? fundamentals.peRatio.toFixed(1) : '—'} />
                  <Row
                    label="EPS"
                    value={fundamentals?.epsMinor ? formatMoney(fundamentals.epsMinor, currency) : '—'}
                  />
                  <Row
                    label="Dividend yield"
                    value={fundamentals?.dividendYieldBps ? `${(fundamentals.dividendYieldBps / 100).toFixed(2)}%` : '—'}
                  />
                  <Row
                    label="52-week range"
                    value={fundamentals?.week52LowMinor && fundamentals?.week52HighMinor
                      ? `${formatMoney(fundamentals.week52LowMinor, currency)} – ${formatMoney(fundamentals.week52HighMinor, currency)}`
                      : '—'}
                  />
                </>
              )}

              {!fundamentals && kind !== 'etf' ? (
                <p className="rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
                  Company statistics need a market-data key. Pockit shows a dash rather than an estimate.
                </p>
              ) : null}

              {fundamentals ? (
                <Provenance source={fundamentals.source} asOf={fundamentals.asOf} simulated={fundamentals.simulated} className="pt-1" />
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Today" />
            <CardBody className="space-y-2.5 text-sm">
              <Row
                label="Price"
                value={quote ? formatMoney(quote.priceMinor, quote.currency) : '—'}
              />
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[var(--text-muted)]">Change</span>
                <Change bps={quote?.changeBps ?? null} />
              </div>
              <Row label="Previous close" value={quote?.previousCloseMinor ? formatMoney(quote.previousCloseMinor, quote.currency) : '—'} />
              <Row
                label="Day range"
                value={quote?.dayLowMinor && quote?.dayHighMinor
                  ? `${formatMoney(quote.dayLowMinor, quote.currency)} – ${formatMoney(quote.dayHighMinor, quote.currency)}`
                  : '—'}
              />
              {quote ? <Provenance source={quote.source} asOf={quote.asOf} simulated={quote.simulated} className="pt-1" /> : null}
            </CardBody>
          </Card>

          {profile?.assetClassNote ? (
            <p className="rounded-[var(--radius-card)] bg-[var(--warning-soft)] px-4 py-3 text-xs leading-relaxed text-[var(--text-muted)]">
              {profile.assetClassNote}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 text-right">
        <span className="tabular block truncate font-medium">{value}</span>
        {note ? <span className="block text-2xs text-[var(--text-subtle)]">{note}</span> : null}
      </span>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="pk-figure mt-0.5 text-base">{value}</p>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { ArrowRight, Compass, Target } from 'lucide-react';
import { requireAuth } from '@/lib/auth/guard';
import { withUser } from '@/lib/db/client';
import { watchlistItems, holdings, investorProfiles } from '@/lib/db/schema';
import { entriesIn, catalogEntry, marketData } from '@/lib/market';
import { Card, CardBody, CardHeader, LinkButton } from '@/components/ui/primitives';
import { AssetCard } from '@/components/market/asset-card';
import { Change } from '@/components/market/change';
import { Sparkline } from '@/components/market/sparkline';
import { Provenance } from '@/components/market/provenance';
import { formatMoney, sumMinor } from '@/lib/money';
import { summarise, summariseSymbols, sourceInfo } from './data';

export const metadata: Metadata = { title: 'Investing' };
export const dynamic = 'force-dynamic';

/**
 * The investing home.
 *
 * Ordered by what is actually yours: your holdings first, then what you are
 * following, then the wider market. A page that opens with somebody else's idea of
 * the top movers buries the only numbers on it that belong to you.
 */
export default async function InvestingHome() {
  const { user, workspace } = await requireAuth();
  const source = marketData();

  const [watchRows, holdingRows, profileRow] = await withUser(user.id, async (tx) => Promise.all([
    tx.select().from(watchlistItems).where(eq(watchlistItems.workspaceId, workspace.id)),
    tx.select().from(holdings).where(eq(holdings.workspaceId, workspace.id)),
    tx.select().from(investorProfiles).where(eq(investorProfiles.workspaceId, workspace.id)).limit(1),
  ]));

  const benchmarkEntries = ['VOO', 'VTI', 'VT', 'BND']
    .map(catalogEntry)
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const [benchmarks, watched, popular] = await Promise.all([
    summarise(benchmarkEntries),
    summariseSymbols(watchRows.slice(0, 6).map((w) => w.symbol)),
    summarise(entriesIn('broad_market').slice(0, 4)),
  ]);

  const heldSymbols = holdingRows.map((h) => h.symbol).filter((s): s is string => Boolean(s));
  const quotes = heldSymbols.length > 0 ? await source.quotes(heldSymbols) : new Map();

  const portfolioValue = sumMinor(holdingRows.map((h) => {
    const q = h.symbol ? quotes.get(h.symbol.toUpperCase()) : undefined;
    const units = Number(h.quantity);
    return q && units > 0
      ? BigInt(Math.round(Number(q.priceMinor) * units))
      : BigInt(h.currentValueMinor as unknown as string);
  }));
  const portfolioCost = sumMinor(holdingRows.map((h) => BigInt(h.costBasisMinor as unknown as string)));
  const portfolioGain = portfolioValue - portfolioCost;
  const cur = workspace.baseCurrency;
  const info = sourceInfo();

  return (
    <div className="space-y-6">
      {/* Yours */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Your portfolio"
            description={holdingRows.length > 0 ? `${holdingRows.length} holding${holdingRows.length === 1 ? '' : 's'}` : 'Nothing tracked yet'}
            action={holdingRows.length > 0
              ? <Link href="/investing/portfolio" className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--accent)] hover:underline">Details <ArrowRight className="h-3 w-3" /></Link>
              : undefined}
          />
          <CardBody>
            {holdingRows.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                Add what you own under <Link href="/accounts" className="font-medium text-[var(--accent)] hover:underline">Accounts</Link> and
                it will be valued here and counted in your net worth. Following something is not the same
                as owning it — the watchlist stays separate on purpose.
              </p>
            ) : (
              <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Value</p>
                  <p className="pk-figure text-3xl">{formatMoney(portfolioValue, cur)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Gain / loss</p>
                  <p className={`pk-figure text-xl ${portfolioGain < 0n ? 'text-[var(--negative)]' : portfolioGain > 0n ? 'text-[var(--positive)]' : ''}`}>
                    {formatMoney(portfolioGain, cur)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Return</p>
                  <p className="pk-figure text-xl">
                    {portfolioCost > 0n ? `${(Number((portfolioGain * 10000n) / portfolioCost) / 100).toFixed(1)}%` : '—'}
                  </p>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your profile" />
          <CardBody>
            {profileRow[0] ? (
              <>
                <p className="text-sm">
                  You answered as{' '}
                  <strong>{LEVEL_WORDS[profileRow[0].level] ?? profileRow[0].level}</strong>.
                </p>
                {profileRow[0].stocksPct != null ? (
                  <div className="mt-3 flex h-3 overflow-hidden rounded-full">
                    <div className="bg-[var(--chart-1)]" style={{ width: `${profileRow[0].stocksPct}%` }} />
                    <div className="bg-[var(--chart-2)]" style={{ width: `${profileRow[0].bondsPct ?? 0}%` }} />
                    <div className="bg-[var(--chart-5)]" style={{ width: `${profileRow[0].cashPct ?? 0}%` }} />
                  </div>
                ) : null}
                <Link href="/investing/profile" className="mt-3 inline-flex items-center gap-0.5 text-sm font-medium text-[var(--accent)] hover:underline">
                  Review it <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--text-muted)]">
                  Five questions about your situation, and Pockit will say what kind of mix suits the
                  answers — or that investing is not the right next step at all.
                </p>
                <LinkButton href="/investing/profile" variant="primary" size="sm" className="mt-3">
                  <Target className="h-3.5 w-3.5" />
                  Work out my profile
                </LinkButton>
              </>
            )}
          </CardBody>
        </Card>
      </section>

      {/* Following */}
      {watched.length > 0 ? (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">You are following</h2>
            <Link href="/investing/watchlist" className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--accent)] hover:underline">
              All {watchRows.length} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {watched.map((a) => <AssetCard key={a.symbol} asset={a} watched />)}
          </div>
        </section>
      ) : null}

      {/* The market */}
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Broad market</h2>
          <span className="text-2xs text-[var(--text-subtle)]">Whole-market funds, as a reference point</span>
        </div>
        <Card className="overflow-hidden">
          <ul className="divide-y divide-[var(--border)]">
            {benchmarks.map((b) => (
              <li key={b.symbol}>
                <Link href={`/investing/${b.symbol}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--surface-2)]">
                  <div className="min-w-0 flex-1">
                    <p className="pk-display text-sm font-bold">{b.symbol}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{b.tracks ?? b.name}</p>
                  </div>
                  <Sparkline values={b.spark} className="hidden shrink-0 sm:block" />
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-semibold">
                      {b.priceMinor === null ? '—' : formatMoney(BigInt(Math.round(b.priceMinor)), b.currency)}
                    </p>
                    <Change bps={b.changeBps} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Provenance source={info.label} asOf={new Date().toISOString()} simulated={!info.live} className="mt-2" />
      </section>

      {/* Discovery */}
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Compass className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.1} />
            Start exploring
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { href: '/investing/etfs', title: 'Funds', body: 'One purchase, hundreds of companies. Where most people sensibly start.' },
            { href: '/investing/stocks', title: 'Individual shares', body: 'Single companies, grouped by sector and size.' },
            { href: '/investing/crypto', title: 'Crypto', body: 'Far more volatile, and not covered by investor protection.' },
          ].map((c) => (
            <Link key={c.href} href={c.href} className="block">
              <Card interactive className="h-full p-4">
                <p className="text-sm font-semibold">{c.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{c.body}</p>
              </Card>
            </Link>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {popular.map((a) => <AssetCard key={a.symbol} asset={a} />)}
        </div>
      </section>
    </div>
  );
}

const LEVEL_WORDS: Record<string, string> = {
  growth: 'suited to a growth mix',
  balanced: 'suited to a balanced mix',
  conservative: 'suited to a conservative mix',
  cash: 'better off in cash for now',
  not_yet: 'not ready to invest yet',
};

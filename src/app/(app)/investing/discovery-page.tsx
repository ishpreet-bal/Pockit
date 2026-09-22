import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/guard';
import { withUser } from '@/lib/db/client';
import { watchlistItems } from '@/lib/db/schema';
import { collectionsFor, entriesIn, type AssetKind } from '@/lib/market';
import { Discovery, type CollectionGroup } from './discovery';
import { summarise, sourceInfo } from './data';

/**
 * The shared body of the Stocks, ETFs and Crypto pages.
 *
 * All three ask the same question of different data, so they are one component with
 * a `kind` rather than three near-identical files that drift apart.
 */
export async function DiscoveryPage({ kind, methodology }: { kind: AssetKind; methodology: string }) {
  const { user, workspace } = await requireAuth();

  const collections = collectionsFor(kind);

  // One batch for the whole page, not one per collection. The same fund sits in
  // several collections, and summarising each separately priced it several times
  // over — on a plan that allows eight lookups a minute.
  const unique = new Map<string, ReturnType<typeof entriesIn>[number]>();
  for (const c of collections) for (const e of entriesIn(c.id)) unique.set(e.symbol, e);

  const [summaries, watched] = await Promise.all([
    summarise([...unique.values()]),
    withUser(user.id, (tx) =>
      tx.select({ symbol: watchlistItems.symbol }).from(watchlistItems)
        .where(eq(watchlistItems.workspaceId, workspace.id)),
    ),
  ]);

  const bySymbol = new Map(summaries.map((a) => [a.symbol, a]));
  const groups: CollectionGroup[] = collections.map((c) => ({
    id: c.id,
    label: c.label,
    blurb: c.blurb,
    assets: entriesIn(c.id).map((e) => bySymbol.get(e.symbol)).filter((a): a is NonNullable<typeof a> => Boolean(a)),
  }));

  const source = sourceInfo();

  return (
    <Discovery
      groups={groups.filter((g) => g.assets.length > 0)}
      sourceLabel={source.label}
      live={source.live}
      methodology={methodology}
      watched={watched.map((w) => w.symbol.toUpperCase())}
    />
  );
}

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
  const [groups, watched] = await Promise.all([
    Promise.all(
      collections.map(async (c): Promise<CollectionGroup> => ({
        id: c.id,
        label: c.label,
        blurb: c.blurb,
        assets: await summarise(entriesIn(c.id)),
      })),
    ),
    withUser(user.id, (tx) =>
      tx.select({ symbol: watchlistItems.symbol }).from(watchlistItems)
        .where(eq(watchlistItems.workspaceId, workspace.id)),
    ),
  ]);

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

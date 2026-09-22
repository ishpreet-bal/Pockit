import type { Metadata } from 'next';
import { and, eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/guard';
import { withUser } from '@/lib/db/client';
import { watchlistItems } from '@/lib/db/schema';
import { listsFor } from '@/lib/investing/lists';
import { Card, EmptyState, LinkButton } from '@/components/ui/primitives';
import { Provenance } from '@/components/market/provenance';
import { summariseSymbols, sourceInfo } from '../data';
import { WatchlistTable } from './watchlist-table';
import { ListTabs } from './list-tabs';

export const metadata: Metadata = { title: 'Watchlist' };
export const dynamic = 'force-dynamic';

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const { user, workspace } = await requireAuth();
  const requested = (await searchParams).list;

  const { lists, rows, activeId } = await withUser(user.id, async (tx) => {
    const all = await listsFor(tx, workspace.id);
    // An id from a stale link or a deleted list falls back to the first list rather
    // than rendering an empty page that looks like data loss.
    const active = all.find((l) => l.id === requested) ?? all[0]!;
    const items = await tx
      .select()
      .from(watchlistItems)
      .where(and(eq(watchlistItems.workspaceId, workspace.id), eq(watchlistItems.listId, active.id)));
    return { lists: all, rows: items, activeId: active.id };
  });

  const assets = rows.length > 0 ? await summariseSymbols(rows.map((r) => r.symbol)) : [];
  const source = sourceInfo();

  return (
    <div>
      <ListTabs lists={lists} activeId={activeId} />

      {assets.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            title="Nothing on this list yet"
            description="Star anything you want to keep an eye on. Following is not owning — nothing here counts towards your net worth or your budget."
            action={<LinkButton href="/investing/etfs" variant="primary">Browse funds</LinkButton>}
          />
        </Card>
      ) : (
        <div className="mt-4">
          <WatchlistTable assets={assets} listId={activeId} />
          <Provenance
            source={source.label}
            asOf={new Date().toISOString()}
            simulated={!source.live}
            className="mt-3"
            note="prices may be delayed"
          />
        </div>
      )}
    </div>
  );
}

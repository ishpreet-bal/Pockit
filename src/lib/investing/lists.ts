import 'server-only';
import { and, asc, eq, sql } from 'drizzle-orm';
import { watchlists, watchlistItems } from '@/lib/db/schema';
import type { Db } from '@/lib/db/client';

/** The name a workspace's first list gets, and the one the backfill created. */
export const DEFAULT_LIST_NAME = 'Watchlist';

export interface ListSummary {
  id: string;
  name: string;
  count: number;
}

/**
 * The workspace's lists, with how many symbols are on each.
 *
 * Creates the default list when there is none, because every screen that shows
 * watchlists needs somewhere to put a symbol, and an empty picker is a dead end
 * rather than a state worth rendering.
 */
export async function listsFor(tx: Db, workspaceId: string): Promise<ListSummary[]> {
  const rows = await tx
    .select({
      id: watchlists.id,
      name: watchlists.name,
      count: sql<number>`count(${watchlistItems.id})::int`,
    })
    .from(watchlists)
    .leftJoin(watchlistItems, eq(watchlistItems.listId, watchlists.id))
    .where(eq(watchlists.workspaceId, workspaceId))
    .groupBy(watchlists.id, watchlists.name, watchlists.position)
    .orderBy(asc(watchlists.position), asc(watchlists.name));

  if (rows.length > 0) return rows;

  const created = await tx
    .insert(watchlists)
    .values({ workspaceId, name: DEFAULT_LIST_NAME, position: 0 })
    .returning({ id: watchlists.id, name: watchlists.name });

  return created.map((l) => ({ ...l, count: 0 }));
}

/** The list a symbol goes on when the caller did not pick one. */
export async function defaultListId(tx: Db, workspaceId: string): Promise<string> {
  const all = await listsFor(tx, workspaceId);
  // `listsFor` creates the default rather than returning nothing, so this is a type
  // narrowing under `noUncheckedIndexedAccess`, not a real fallback path.
  const first = all[0];
  if (!first) throw new Error('Could not resolve a watchlist to use.');
  return first.id;
}

/** Is this list one of the caller's? Checked explicitly so a stray id cannot write across workspaces. */
export async function ownsList(tx: Db, workspaceId: string, listId: string): Promise<boolean> {
  const found = await tx
    .select({ id: watchlists.id })
    .from(watchlists)
    .where(and(eq(watchlists.id, listId), eq(watchlists.workspaceId, workspaceId)))
    .limit(1);
  return found.length > 0;
}

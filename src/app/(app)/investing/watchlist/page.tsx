import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/guard';
import { withUser } from '@/lib/db/client';
import { watchlistItems } from '@/lib/db/schema';
import { Card, EmptyState, LinkButton } from '@/components/ui/primitives';
import { Provenance } from '@/components/market/provenance';
import { summariseSymbols, sourceInfo } from '../data';
import { WatchlistTable } from './watchlist-table';

export const metadata: Metadata = { title: 'Watchlist' };
export const dynamic = 'force-dynamic';

export default async function WatchlistPage() {
  const { user, workspace } = await requireAuth();

  const rows = await withUser(user.id, (tx) =>
    tx.select().from(watchlistItems).where(eq(watchlistItems.workspaceId, workspace.id)),
  );

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nothing followed yet"
          description="Star anything you want to keep an eye on. Following is not owning — nothing here counts towards your net worth or your budget."
          action={<LinkButton href="/investing/etfs" variant="primary">Browse funds</LinkButton>}
        />
      </Card>
    );
  }

  const assets = await summariseSymbols(rows.map((r) => r.symbol));
  const source = sourceInfo();

  return (
    <div>
      <WatchlistTable assets={assets} />
      <Provenance
        source={source.label}
        asOf={new Date().toISOString()}
        simulated={!source.live}
        className="mt-3"
        note="prices may be delayed"
      />
    </div>
  );
}

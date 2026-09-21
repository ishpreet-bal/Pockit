import type { Metadata } from 'next';
import { DiscoveryPage } from '../discovery-page';
import { CATALOG_REVIEWED } from '@/lib/market';

export const metadata: Metadata = { title: 'ETFs' };
export const dynamic = 'force-dynamic';

export default function EtfsPage() {
  return (
    <DiscoveryPage
      kind="etf"
      methodology={
        `Funds are grouped by what they actually track. Expense ratios are indicative figures from ` +
        `published fund documents, last reviewed ${CATALOG_REVIEWED} — verify the current figure with the ` +
        `issuer before acting on it. "Low cost" means an indicative ratio at or below 0.10% a year. ` +
        `This is not a ranking and not a recommendation.`
      }
    />
  );
}

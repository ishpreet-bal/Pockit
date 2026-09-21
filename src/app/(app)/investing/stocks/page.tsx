import type { Metadata } from 'next';
import { DiscoveryPage } from '../discovery-page';
import { CATALOG_REVIEWED } from '@/lib/market';

export const metadata: Metadata = { title: 'Stocks' };
export const dynamic = 'force-dynamic';

export default function StocksPage() {
  return (
    <DiscoveryPage
      kind="stock"
      methodology={
        `These are hand-picked reference lists of widely held companies, grouped by sector and size, ` +
        `last reviewed ${CATALOG_REVIEWED}. They are NOT a ranking and not a recommendation: membership ` +
        `is by the stated criterion only, and inclusion says nothing about whether something is a good ` +
        `investment. Prices and daily changes come from the source named below.`
      }
    />
  );
}

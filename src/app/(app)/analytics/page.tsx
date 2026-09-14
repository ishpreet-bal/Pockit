import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAuth();
  return <ComingSoon title="Analytics" description="The full analytics screens are not built yet" engineNote="Spending patterns, category rollups, merchant analysis and net-worth history are all implemented in src/lib/finance/patterns.ts and networth.ts, and feed the Overview today." />;
}

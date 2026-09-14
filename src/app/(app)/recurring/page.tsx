import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Recurring' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAuth();
  return <ComingSoon title="Recurring" description="The subscription dashboard is not built yet" engineNote="Recurring detection runs on every Overview load and reports monthly and annual totals, cadence, next payment and price increases. The management screen is still to come." />;
}

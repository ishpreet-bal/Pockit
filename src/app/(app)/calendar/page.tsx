import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAuth();
  return <ComingSoon title="Calendar" description="The financial calendar is not built yet" engineNote="Recurring detection already computes next-expected dates, which feed the Coming Up card on your Overview. The month-grid view is still to come." />;
}

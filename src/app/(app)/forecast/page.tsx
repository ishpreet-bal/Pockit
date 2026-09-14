import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Forecast' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAuth();
  return <ComingSoon title="Forecast" description="Cash-flow forecasting is not wired to a screen yet" engineNote="The forecasting and safe-to-spend engine is built and tested (src/lib/finance/forecast.ts), and its output already drives the Safe to Spend card on your Overview. The dedicated 7/30/60/90-day screen is the next thing to build." />;
}

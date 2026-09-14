import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Debts' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAuth();
  return <ComingSoon title="Debts" description="The payoff simulator is not wired to a screen yet" engineNote="The avalanche, snowball and custom payoff simulation is built and tested in src/lib/finance/debt.ts, including interest and timeline comparison." />;
}

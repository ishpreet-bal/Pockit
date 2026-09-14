import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Business' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAuth();
  return <ComingSoon title="Business" description="The business workspace is not built yet" engineNote="Transactions already carry personal, business and split classification, and the ledger splits totals correctly. Invoices, customers and vendors have schema but no screens yet." />;
}

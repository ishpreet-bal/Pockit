import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Imports' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAuth();
  return <ComingSoon title="Imports" description="The import pipeline is not built yet" engineNote="The database staging tables, duplicate scoring and rollback design are all in place. Parsers and the review queue are the next milestone." />;
}

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { ComingSoon } from '../../coming-soon';

export const metadata: Metadata = { title: 'New import' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAuth();
  return (
    <ComingSoon
      title="Import"
      description="File import is not built yet"
      engineNote="Until it is, add transactions manually from the Transactions screen, or load demo data from your Overview to explore the app."
    />
  );
}

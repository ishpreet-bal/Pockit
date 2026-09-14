import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAuth();
  return <ComingSoon title="Settings" description="Settings screens are not built yet" engineNote="Your profile, currency, timezone and privacy preferences are stored and honoured; the editing UI is still to come." />;
}

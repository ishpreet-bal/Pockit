import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { ComingSoon } from '../coming-soon';

export const metadata: Metadata = { title: 'Assistant' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAuth();
  return <ComingSoon title="Assistant" description="The AI assistant is not built yet" engineNote="The provider abstraction is designed so the assistant answers only from real query results, never from invented numbers. It needs an API key and the tool layer before it can be switched on." />;
}

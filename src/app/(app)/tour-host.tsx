import { Suspense } from 'react';
import { eq } from 'drizzle-orm';
import { withoutUser } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema';
import { ProductTour } from '@/components/tour/product-tour';

/**
 * Mounts the tour for the whole app.
 *
 * In the layout rather than on Overview so the spotlight can reach the navigation,
 * the quick-add button and Pock — none of which belong to any one page.
 *
 * `useSearchParams` inside forces a Suspense boundary; without one the entire
 * layout opts out of static rendering.
 */
export async function TourHost({ userId }: { userId: string }) {
  const rows = await withoutUser((tx) =>
    tx.select({ tourCompletedAt: userProfiles.tourCompletedAt, name: userProfiles.displayName })
      .from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
  );

  return (
    <Suspense fallback={null}>
      <ProductTour alreadyDone={Boolean(rows[0]?.tourCompletedAt)} name={rows[0]?.name?.split(' ')[0] ?? null} />
    </Suspense>
  );
}

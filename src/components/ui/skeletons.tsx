import { Skeleton } from './primitives';

/**
 * Loading states that match the shape of what is coming.
 *
 * A spinner says "wait"; a skeleton says "a big number goes here, then four tiles,
 * then a list" — so the page does not appear to jump when the data lands. These
 * mirror the real layouts closely enough that the swap is barely visible, which is
 * the entire point.
 */

const GUTTER = 'px-4 sm:px-6 lg:px-8';

export function DashboardSkeleton() {
  return (
    <div className={`space-y-8 py-6 sm:py-8 ${GUTTER}`} aria-busy="true" aria-label="Loading your dashboard">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-6 h-3.5 w-32" />
        <Skeleton className="mt-2 h-11 w-64" />
        <Skeleton className="mt-3 h-4 w-full max-w-md" />

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2.5 h-6 w-24" />
              <Skeleton className="mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Skeleton className="h-4 w-24" />
          <div className="mt-3 space-y-px rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <Skeleton className="h-10 w-11 rounded-[var(--radius-control)]" />
                <div className="flex-1">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="mt-1.5 h-3 w-16" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
          <Skeleton className="h-4 w-28" />
          <div className="mt-3 flex flex-col items-center gap-6 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:flex-row">
            <Skeleton className="h-[168px] w-[168px] shrink-0 rounded-full" />
            <div className="w-full space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-full" />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton({ title, rows = 6 }: { title?: string; rows?: number }) {
  return (
    <div className={`space-y-4 py-6 sm:py-8 ${GUTTER}`} aria-busy="true" aria-label={title ? `Loading ${title}` : 'Loading'}>
      <Skeleton className="h-7 w-44" />
      <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-[var(--border)] py-3 last:border-0">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="mt-1.5 h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className={`space-y-4 py-6 sm:py-8 ${GUTTER}`} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-44" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 h-7 w-40" />
            <Skeleton className="mt-3 h-2 w-full rounded-full" />
            <Skeleton className="mt-3 h-3 w-48" />
          </div>
        ))}
      </div>
    </div>
  );
}

import { Info } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

/**
 * Where a figure came from and when.
 *
 * Shown wherever freshness or authenticity matters, which on this section of the app
 * is nearly everywhere. Simulated data gets a visibly different treatment rather than
 * a quieter one — the point is that it cannot be mistaken for a market.
 */
export function Provenance({
  source, asOf, simulated, className, note,
}: {
  source: string;
  asOf: string | null;
  simulated: boolean;
  className?: string;
  note?: string;
}) {
  const when = asOf ? new Date(asOf) : null;
  const valid = when && !Number.isNaN(when.getTime());
  const stamp = valid
    ? when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-2xs',
        simulated ? 'text-[var(--warning)]' : 'text-[var(--text-subtle)]',
        className,
      )}
    >
      <Info className="h-3 w-3 shrink-0" strokeWidth={2} />
      <span>
        {simulated ? <strong>Sample data, not a real market. </strong> : null}
        {source}
        {/*
          The server and the browser are in different locales and time zones, so this
          string legitimately differs between them — which React reports as a
          hydration mismatch. `suppressHydrationWarning` is the sanctioned answer for
          exactly this case: the browser's rendering is the correct one to keep.
        */}
        {stamp ? <time dateTime={asOf ?? undefined} suppressHydrationWarning> · {stamp}</time> : null}
        {note ? ` · ${note}` : null}
      </span>
    </p>
  );
}

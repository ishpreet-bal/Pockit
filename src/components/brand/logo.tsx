import { cn } from '@/lib/ui/cn';
import { PockMark } from './pock-mark';

/**
 * The Pockit mark: the "P" with two eyes, the same drawing as the app icon and
 * the iPhone app (see pock-mark.tsx). Inline SVG in currentColor, so it takes the
 * palette and needs no network request.
 */
export function Mark({ className, title }: { className?: string; title?: string }) {
  return <PockMark className={className} title={title} />;
}

/**
 * The full lockup. `tone` decides whether the mark sits in a filled tile (for small
 * placements like the sidebar, where it needs to hold its own) or draws in the
 * accent colour directly (for larger, quieter placements).
 */
export function Logo({
  className,
  size = 'md',
  tone = 'tile',
  showWordmark = true,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'tile' | 'plain';
  showWordmark?: boolean;
}) {
  const tile = size === 'lg' ? 'h-12 w-12 rounded-2xl' : size === 'sm' ? 'h-7 w-7 rounded-lg' : 'h-9 w-9 rounded-xl';
  const glyph = size === 'lg' ? 'h-7 w-7' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const word = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg';

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {tone === 'tile' ? (
        <span
          className={cn(
            // A soft tile with the mark in the accent, as on the app's welcome screen.
            'grid shrink-0 place-items-center bg-[var(--accent-soft)] text-[var(--accent)]',
            tile,
          )}
        >
          <Mark className={glyph} />
        </span>
      ) : (
        <Mark className={cn('shrink-0 text-[var(--accent)]', tile)} />
      )}
      {showWordmark ? (
        <span className={cn('pk-display', word)}>Pockit</span>
      ) : null}
    </span>
  );
}

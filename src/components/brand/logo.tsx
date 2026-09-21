import { cn } from '@/lib/ui/cn';

/**
 * The Pockit mark.
 *
 * A pocket, drawn as a rounded square with a flap, and a coin dropping into it. It
 * is built from three primitives so it survives being 16px in a browser tab — the
 * size where most logos turn to mush — and it is inline SVG rather than an image
 * file so it inherits the palette and needs no network request.
 *
 * The mascot in `mascot.tsx` is deliberately this same shape with a face. One form,
 * two uses: the character and the brand cannot drift apart because they are the
 * same drawing.
 */
export function Mark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* The pocket body. */}
      <rect x="3" y="8" width="26" height="21" rx="6" fill="currentColor" />
      {/* The flap, cut as a lighter overlay so it reads at any size. */}
      <path
        d="M3 14.5 C3 10.9 5.9 8 9.5 8 h13 C26.1 8 29 10.9 29 14.5 v1.5 H3 Z"
        fill="currentColor"
        opacity="0.55"
      />
      {/* The coin, mid-drop. */}
      <circle cx="16" cy="5" r="3.4" fill="currentColor" />
    </svg>
  );
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
            'grid shrink-0 place-items-center bg-[var(--accent-fill)] text-[var(--accent-fill-fg)] shadow-[var(--shadow-sm)]',
            tile,
          )}
        >
          <Mark className={glyph} />
        </span>
      ) : (
        <Mark className={cn('shrink-0 text-[var(--accent)]', tile)} />
      )}
      {showWordmark ? (
        <span className={cn('pk-display font-bold tracking-[-0.03em]', word)}>Pockit</span>
      ) : null}
    </span>
  );
}

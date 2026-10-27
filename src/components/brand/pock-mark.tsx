/**
 * The Pock mark: the "P" with two eyes, as on the app icon and in the iPhone app
 * (mobile/components/Pock.tsx). Drawn in currentColor so it takes the text colour.
 */
export function PockMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d="M6 20V6.5A2.5 2.5 0 0 1 8.5 4H13a5.5 5.5 0 0 1 0 11H9" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={11.5} cy={9.5} r={1.25} fill="currentColor" />
      <circle cx={15} cy={9.5} r={1.25} fill="currentColor" />
    </svg>
  );
}

/** The mark on a soft tile, as at the top of the app's welcome screen. */
export function PockTile({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'h-20 w-20 rounded-[22px]' : 'h-10 w-10 rounded-[12px]';
  const mark = size === 'lg' ? 'h-11 w-11' : 'h-6 w-6';
  return (
    <span className={`inline-flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent)] ${box}`}>
      <PockMark className={mark} />
    </span>
  );
}

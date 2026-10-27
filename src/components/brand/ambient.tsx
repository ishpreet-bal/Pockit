/**
 * Slow drifting light behind the welcome and setup screens.
 *
 * Three faint, warm blurred orbs in the palette's own colours, on long offset loops so they
 * never visibly repeat. It is the difference between a page that is on and a page
 * that is alive — and it sits behind everything, never under a word of text.
 */
export function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      <div className="pk-orb left-[-10%] top-[-10%] h-[55vmax] w-[55vmax] bg-[var(--accent-fill)] opacity-[0.07]" />
      <div
        className="pk-orb bottom-[-20%] right-[-15%] h-[50vmax] w-[50vmax] bg-[var(--warning)] opacity-[0.06]"
        style={{ animationDuration: '24s', animationDelay: '-6s' }}
      />
      <div
        className="pk-orb left-[30%] top-[40%] h-[30vmax] w-[30vmax] bg-[var(--chart-4)] opacity-[0.05]"
        style={{ animationDuration: '30s', animationDelay: '-12s' }}
      />
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export type Mood = 'idle' | 'happy' | 'thinking' | 'concerned' | 'celebrating';

/**
 * Pock — a sea otter.
 *
 * Floating on its back and holding a coin to its chest, because that is what sea
 * otters actually do with things they value (they keep a favourite stone), and a
 * money app's guide holding onto a coin reads instantly without a word of copy.
 *
 * It is drawn in fixed otter colours rather than `currentColor`. The previous
 * mascot inherited the brand colour, which made it a logo with a face; this one is
 * meant to be a character, and a character should look the same on every surface.
 *
 * Motion is layered and slow — a float on the water, a blink every few seconds,
 * a whisker twitch — because constant fast movement next to a bank balance reads
 * as anxiety. Everything stops under `prefers-reduced-motion`.
 */
export function Mascot({
  mood = 'idle',
  className,
  animate = true,
}: {
  mood?: Mood;
  className?: string;
  animate?: boolean;
}) {
  const reduced = useReducedMotion();
  const moving = animate && !reduced;
  const blink = useBlink(moving);

  const float = moving
    ? mood === 'celebrating'
      ? { y: [0, -5, 0], rotate: [-4, 4, -4] }
      : { y: [0, -1.6, 0], rotate: [-2.5, 2.5, -2.5] }
    : undefined;

  return (
    <motion.svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={`Pock the sea otter looks ${MOOD_WORDS[mood]}`}
      animate={float}
      transition={moving ? { duration: mood === 'celebrating' ? 0.9 : 4.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
      style={{ overflow: 'visible' }}
    >
      {/* Water line — only a hint, so the otter reads as floating, not swimming. */}
      <path d="M6 52 Q16 48 26 52 T46 52 T58 52" fill="none" stroke="#5ed3f0" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />

      {/* Body */}
      <ellipse cx="32" cy="42" rx="17" ry="12" fill="#7a4e33" />
      <ellipse cx="32" cy="44" rx="11" ry="8" fill="#c79d7a" />

      {/* Tail peeking out */}
      <path d="M47 46 Q56 47 58 42" fill="none" stroke="#6a4229" strokeWidth="4" strokeLinecap="round" />

      {/* Head */}
      <circle cx="32" cy="24" r="15" fill="#8a5a3c" />
      {/* Ears */}
      <circle cx="19.5" cy="13.5" r="3.4" fill="#7a4e33" />
      <circle cx="44.5" cy="13.5" r="3.4" fill="#7a4e33" />
      <circle cx="19.5" cy="13.5" r="1.6" fill="#c79d7a" />
      <circle cx="44.5" cy="13.5" r="1.6" fill="#c79d7a" />
      {/* Pale face mask — the thing that makes it read as a sea otter at 32px */}
      <ellipse cx="32" cy="27" rx="11.5" ry="9.5" fill="#e8cfb4" />

      {/* Eyes */}
      <g>
        {mood === 'happy' || mood === 'celebrating' ? (
          <>
            <path d="M22.5 22.5 Q25 19.5 27.5 22.5" fill="none" stroke="#1a1210" strokeWidth="2" strokeLinecap="round" />
            <path d="M36.5 22.5 Q39 19.5 41.5 22.5" fill="none" stroke="#1a1210" strokeWidth="2" strokeLinecap="round" />
          </>
        ) : (
          <>
            <ellipse cx="25" cy={mood === 'thinking' ? 20.5 : 22} rx="2.4" ry={blink ? 0.3 : 2.6} fill="#1a1210" />
            <ellipse cx="39" cy={mood === 'thinking' ? 20.5 : 22} rx="2.4" ry={blink ? 0.3 : 2.6} fill="#1a1210" />
            {!blink ? (
              <>
                <circle cx="25.8" cy={mood === 'thinking' ? 19.6 : 21} r="0.8" fill="#fff" />
                <circle cx="39.8" cy={mood === 'thinking' ? 19.6 : 21} r="0.8" fill="#fff" />
              </>
            ) : null}
          </>
        )}
        {/* A slight inward tilt of the brows, not a frown: "I noticed", not "I disapprove". */}
        {mood === 'concerned' ? (
          <>
            <path d="M21.5 17.5 L27 18.8" stroke="#4a2e1d" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M42.5 17.5 L37 18.8" stroke="#4a2e1d" strokeWidth="1.4" strokeLinecap="round" />
          </>
        ) : null}
      </g>

      {/* Nose and mouth */}
      <ellipse cx="32" cy="27.5" rx="2.6" ry="1.9" fill="#2b1d17" />
      <path
        d={mood === 'concerned' ? 'M29.5 32 Q32 31 34.5 32' : 'M29 30.5 Q32 33.5 35 30.5'}
        fill="none" stroke="#2b1d17" strokeWidth="1.3" strokeLinecap="round"
      />

      {/* Whiskers */}
      <motion.g
        stroke="#f7ecdf" strokeWidth="0.9" strokeLinecap="round" opacity="0.9"
        animate={moving ? { rotate: [0, 2, 0, -1, 0] } : undefined}
        transition={moving ? { duration: 5, repeat: Infinity, ease: 'easeInOut', times: [0, 0.1, 0.2, 0.3, 1] } : undefined}
        style={{ originX: '32px', originY: '28px' }}
      >
        <path d="M24 28 L15 26.5" />
        <path d="M24 29.5 L15 30.5" />
        <path d="M40 28 L49 26.5" />
        <path d="M40 29.5 L49 30.5" />
      </motion.g>

      {/* Paws holding the coin. `thinking` lifts one paw to the chin instead. */}
      {mood === 'thinking' ? (
        <>
          <circle cx="38" cy="35" r="3.2" fill="#6a4229" />
          <Coin cx={28} cy={41} moving={false} />
          <circle cx="24" cy="41" r="3.2" fill="#6a4229" />
        </>
      ) : (
        <>
          <Coin cx={32} cy={mood === 'celebrating' ? 36 : 40} moving={moving && mood === 'celebrating'} />
          <circle cx="25.5" cy="41" r="3.2" fill="#6a4229" />
          <circle cx="38.5" cy="41" r="3.2" fill="#6a4229" />
        </>
      )}
    </motion.svg>
  );
}

function Coin({ cx, cy, moving }: { cx: number; cy: number; moving: boolean }) {
  return (
    <motion.g
      animate={moving ? { y: [0, -6, 0], rotate: [0, 180, 360] } : undefined}
      transition={moving ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : undefined}
      style={{ originX: `${cx}px`, originY: `${cy}px` }}
    >
      <circle cx={cx} cy={cy} r="5" fill="#f5c451" stroke="#c8931f" strokeWidth="1" />
      <circle cx={cx} cy={cy} r="2.6" fill="none" stroke="#c8931f" strokeWidth="0.9" />
    </motion.g>
  );
}

/** A blink every few seconds, at slightly irregular intervals so it feels alive. */
function useBlink(active: boolean): boolean {
  const [shut, setShut] = useState(false);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setShut(true);
        timer = setTimeout(() => { setShut(false); schedule(); }, 140);
      }, 2800 + Math.random() * 3200);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [active]);
  return shut;
}

const MOOD_WORDS: Record<Mood, string> = {
  idle: 'calm',
  happy: 'pleased',
  thinking: 'thoughtful',
  concerned: 'concerned',
  celebrating: 'delighted',
};

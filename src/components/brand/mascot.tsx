'use client';

import { motion, useReducedMotion } from 'framer-motion';

export type Mood = 'idle' | 'happy' | 'thinking' | 'concerned' | 'celebrating';

/**
 * Pock — the guide.
 *
 * It is the logo's pocket with a face, on purpose: one drawn form serving as both
 * brand and character means they can never drift apart, and every appearance of the
 * mascot also reinforces the mark.
 *
 * The moods are drawn with eyes and a mouth only. Resisting the urge to give it arms
 * and props keeps it legible at 32px and keeps it from looking like a different
 * character in every state.
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

  const eyes = EYES[mood];

  return (
    <motion.svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label={`Pock looks ${MOOD_WORDS[mood]}`}
      // A slow, small breath. Anything faster reads as agitation, which is the
      // last thing a character standing next to your bank balance should convey.
      animate={moving ? { y: [0, -1.2, 0] } : undefined}
      transition={moving ? { duration: 3.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
    >
      <rect x="3" y="8" width="26" height="21" rx="6" fill="currentColor" />
      <path
        d="M3 14.5 C3 10.9 5.9 8 9.5 8 h13 C26.1 8 29 10.9 29 14.5 v1.5 H3 Z"
        fill="currentColor"
        opacity="0.55"
      />
      <motion.circle
        cx="16" cy="5" r="3.4" fill="currentColor"
        animate={moving && mood === 'celebrating' ? { cy: [5, 2.5, 5] } : undefined}
        transition={moving ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : undefined}
      />

      {/*
        The face is drawn in the brand fill, which is the opposite of whatever the
        body is drawn in. Inheriting `currentColor` here made it the same colour as
        the pocket, so the character rendered as a blank shape.
      */}
      <g className="text-[var(--accent-fill)]" fill="currentColor">
        {eyes}
        {MOUTHS[mood]}
      </g>
    </motion.svg>
  );
}

const MOOD_WORDS: Record<Mood, string> = {
  idle: 'calm',
  happy: 'pleased',
  thinking: 'thoughtful',
  concerned: 'concerned',
  celebrating: 'delighted',
};

/**
 * Eyes as plain shapes rather than a sprite sheet.
 *
 * `concerned` uses a slight downward tilt rather than a frown, because a frowning
 * character next to a real shortfall reads as judgement. The aim is "I noticed",
 * not "you have failed".
 */
const EYES: Record<Mood, React.ReactNode> = {
  idle: <><circle cx="12" cy="19" r="1.7" /><circle cx="20" cy="19" r="1.7" /></>,
  happy: <><circle cx="12" cy="19" r="1.7" /><circle cx="20" cy="19" r="1.7" /></>,
  thinking: (
    <>
      <circle cx="12" cy="19" r="1.7" />
      <rect x="18.3" y="18.3" width="3.4" height="1.5" rx="0.75" />
    </>
  ),
  concerned: (
    <>
      <circle cx="12" cy="19.4" r="1.6" />
      <circle cx="20" cy="19.4" r="1.6" />
      <rect x="9.8" y="16.4" width="4.4" height="1.2" rx="0.6" transform="rotate(8 12 17)" opacity="0.8" />
      <rect x="17.8" y="16.4" width="4.4" height="1.2" rx="0.6" transform="rotate(-8 20 17)" opacity="0.8" />
    </>
  ),
  celebrating: (
    <>
      <path d="M10.3 19.6 Q12 17.4 13.7 19.6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M18.3 19.6 Q20 17.4 21.7 19.6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </>
  ),
};

const MOUTHS: Record<Mood, React.ReactNode> = {
  idle: <rect x="14" y="23.4" width="4" height="1.4" rx="0.7" opacity="0.85" />,
  happy: <path d="M13 23 Q16 25.6 19 23" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />,
  thinking: <rect x="14.5" y="23.4" width="3" height="1.4" rx="0.7" opacity="0.85" />,
  concerned: <path d="M13.4 24.6 Q16 22.9 18.6 24.6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />,
  celebrating: <ellipse cx="16" cy="23.8" rx="2.2" ry="1.8" />,
};

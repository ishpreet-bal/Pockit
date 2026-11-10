'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export type Mood = 'idle' | 'happy' | 'thinking' | 'concerned' | 'celebrating';

/**
 * Pock: the Pockit mark, a rounded "P" with two eyes, the same as the app icon
 * and the iPhone app (mobile/components/Pock.tsx). One Pock everywhere.
 *
 * Its moods are in the eyes only. It blinks, smiles (eyes curve up), looks up
 * when thinking, lowers its eyes slightly when concerned, and bounces when
 * celebrating. It is drawn in the brand accent unless a text colour is given.
 * All motion stops under `prefers-reduced-motion`.
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
  // A colour class on the caller wins; otherwise Pock wears the accent.
  const colored = /\btext-/.test(className ?? '');

  const bounce = moving && mood === 'celebrating' ? { y: [0, -3, 0], rotate: [-6, 6, -6] } : undefined;
  const eyeY = mood === 'thinking' ? 8.4 : mood === 'concerned' ? 10.3 : 9.5;
  const eyeX = mood === 'thinking' ? 0.5 : 0;

  return (
    <motion.svg
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={`Pock looks ${MOOD_WORDS[mood]}`}
      animate={bounce}
      transition={bounce ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : undefined}
      style={{ overflow: 'visible', color: colored ? undefined : 'var(--accent)' }}
    >
      <path d="M6 20V6.5A2.5 2.5 0 0 1 8.5 4H13a5.5 5.5 0 0 1 0 11H9" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      {mood === 'happy' || mood === 'celebrating' ? (
        <>
          <path d="M10.3 10 Q11.5 8.4 12.7 10" fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
          <path d="M13.8 10 Q15 8.4 16.2 10" fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx={11.5 + eyeX} cy={eyeY} rx={1.25} ry={blink ? 0.15 : 1.25} fill="currentColor" />
          <ellipse cx={15 + eyeX} cy={eyeY} rx={1.25} ry={blink ? 0.15 : 1.25} fill="currentColor" />
        </>
      )}
    </motion.svg>
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

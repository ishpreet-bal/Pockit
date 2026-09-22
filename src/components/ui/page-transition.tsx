'use client';

import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * A short cross-fade-and-rise between routes.
 *
 * Deliberately NOT `AnimatePresence` with an exit animation. Next's App Router
 * swaps the tree on navigation, so an exit would need the outgoing page held in
 * memory — which delays the new page by the length of the exit, on every single
 * click. Animating only the entrance costs nothing: the new content is already
 * there, it just arrives rather than appearing.
 *
 * Keyed on the pathname so it replays per route, and 22px of travel over 260ms,
 * which is enough to read as motion and short enough never to be in the way.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  // The wrapper fades the page in softly; `pk-assemble` then staggers the page's
  // own sections so it builds up rather than appearing in one block. Longer and
  // softer than before (it was 260ms with no blur), which is what read as choppy.
  return (
    <motion.div
      key={pathname}
      className="pk-assemble"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

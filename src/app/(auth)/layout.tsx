import Link from 'next/link';
import { PockTile } from '@/components/brand/pock-mark';

/**
 * Sign-in and sign-up share the welcome screen's look (the mark on cream), so
 * moving from "Get started" to the first question feels like one place.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div className="pk-assemble relative w-full max-w-sm">
        <Link href="/welcome" className="mb-6 flex items-center gap-2.5" aria-label="Back to the welcome screen">
          <PockTile size="sm" />
          <span className="pk-display text-xl">Pockit</span>
        </Link>
        {children}
      </div>
    </div>
  );
}

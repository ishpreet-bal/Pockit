import Link from 'next/link';
import { Mascot } from '@/components/brand/mascot';
import { Ambient } from '@/components/brand/ambient';

/**
 * Sign-in and sign-up share the welcome screen's world — the same drifting light
 * and the same otter — so moving from "Get started" to the first question feels
 * like going further into one place rather than being handed to a form.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <Ambient />
      <div className="pk-assemble relative w-full max-w-sm">
        <Link href="/welcome" className="mb-6 flex items-center gap-2.5" aria-label="Back to the welcome screen">
          <Mascot mood="idle" className="h-11 w-11" />
          <span className="pk-display text-lg font-bold tracking-[-0.03em]">Pockit</span>
        </Link>
        {children}
      </div>
    </div>
  );
}

import { Logo } from '@/components/brand/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <Logo size="md" showWordmark={false} />
          <div>
            <p className="pk-display text-lg font-bold tracking-[-0.03em]">Pockit</p>
            <p className="text-xs text-[var(--text-muted)]">Your financial operating system</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

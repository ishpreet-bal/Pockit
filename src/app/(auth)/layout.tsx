export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent)] text-base font-semibold text-[var(--accent-fg)]">P</span>
          <div>
            <p className="text-lg font-semibold tracking-tight">Pockit</p>
            <p className="text-xs text-[var(--text-muted)]">Your financial operating system</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

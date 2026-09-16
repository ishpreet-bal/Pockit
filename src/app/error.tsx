'use client';

/**
 * Replaces Next.js's bare "Application error: a server-side exception has occurred"
 * with something the person reading it can act on.
 *
 * In practice almost every server exception in this app is one of two things: the
 * deployment has no database configured, or the schema was never migrated. Both are
 * diagnosed properly at `/setup`, so the most useful thing this boundary can do is
 * point there rather than apologise.
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5 py-12">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong loading this page</h1>
      <p className="text-sm text-[var(--text-muted)]">
        If this is a fresh deployment, it is almost certainly the database: it either is not
        configured yet or its tables have not been created. The setup page says which.
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href="/setup"
          className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-3.5 text-sm font-medium text-[var(--accent-fg)]"
        >
          Check setup
        </a>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 text-sm font-medium"
        >
          Try again
        </button>
      </div>
    </main>
  );
}

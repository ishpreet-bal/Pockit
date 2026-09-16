import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { diagnose } from '@/lib/health/diagnose';
import { RunSetup } from './run-setup';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Setup' };

/**
 * The page a broken deployment sends people to.
 *
 * Next.js's default response to a server exception is "Application error: a
 * server-side exception has occurred" plus a digest hash, which tells the person
 * looking at it nothing they can act on. Every realistic first-deploy failure here
 * has exactly two causes — missing configuration or an un-migrated database — and
 * both are things the owner of the deployment can fix in under a minute if someone
 * tells them which one it is.
 */
export default async function SetupPage() {
  const d = await diagnose();

  // Nothing to do here once the app works; sending people onward beats a dead page.
  if (d.status === 'ready') redirect('/');

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-5 py-12">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Pockit setup</p>
        <h1 className="text-2xl font-semibold tracking-tight">Almost there — one thing is missing</h1>
        <p className="text-sm text-[var(--text-muted)]">
          The app is deployed and running. It just cannot reach a working database yet, so every
          page that loads your money fails. Here is exactly what is wrong.
        </p>
      </header>

      <ol className="space-y-3">
        {d.findings.map((f, i) => (
          <li
            key={i}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
          >
            <p className="font-medium">{f.problem}</p>
            <p className="mt-1 text-[var(--text-muted)]">{f.fix}</p>
          </li>
        ))}
      </ol>

      {d.needsMigration ? (
        <RunSetup />
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-muted)]">
          <p className="font-medium text-[var(--text)]">What to do</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Open your hosting dashboard → Settings → Environment Variables.</li>
            <li>
              Set <code className="font-mono text-xs">DATABASE_URL</code>,{' '}
              <code className="font-mono text-xs">AUTH_SECRET</code> (32+ characters) and{' '}
              <code className="font-mono text-xs">ADMIN_SECRET</code>.
            </li>
            <li>Redeploy, then come back to this page.</li>
          </ol>
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        The machine-readable version of this is at{' '}
        <a className="underline" href="/api/health">/api/health</a>.
      </p>
    </main>
  );
}

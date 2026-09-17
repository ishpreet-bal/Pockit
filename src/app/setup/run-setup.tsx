'use client';

import { useState } from 'react';
import { Button, Field, Input } from '@/components/ui/primitives';

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; applied: string[] }
  | { kind: 'error'; message: string };

/**
 * Runs the one-time migration from the browser.
 *
 * The alternative is telling a non-technical owner to construct a curl request with a
 * custom header, which in practice does not happen. The setup key is never stored and
 * never rendered back — it is typed, posted once, and dropped.
 */
export function RunSetup({
  isUpdate = false,
  adminSecretConfigured = true,
}: {
  isUpdate?: boolean;
  adminSecretConfigured?: boolean;
}) {
  const [secret, setSecret] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setState({ kind: 'running' });
    try {
      const res = await fetch('/api/admin/migrate', {
        method: 'POST',
        // Trimmed here as well as on the server: a pasted value often carries a
        // trailing newline, which is not even a legal header value.
        headers: { 'x-admin-secret': secret.trim() },
      });
      const body: unknown = await res.json().catch(() => ({}));
      const data = (body ?? {}) as { ok?: boolean; applied?: string[]; error?: string };
      if (!res.ok || data.ok === false) {
        setState({ kind: 'error', message: data.error ?? `Setup failed (HTTP ${res.status}).` });
        return;
      }
      setSecret('');
      setState({ kind: 'done', applied: data.applied ?? [] });
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not reach the server.',
      });
    }
  }

  if (state.kind === 'done') {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <p className="font-medium">{isUpdate ? 'Update finished.' : 'Setup finished.'}</p>
        <p className="mt-1 text-[var(--text-muted)]">
          {state.applied.length === 1
            ? '1 update was applied.'
            : `${state.applied.length} updates were applied.`}{' '}
          {isUpdate ? 'Your app is ready again.' : 'You can create your account now.'}
        </p>
        <a
          href={isUpdate ? '/overview' : '/sign-up'}
          className="mt-3 inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-3.5 text-sm font-medium text-[var(--accent-fg)]"
        >
          {isUpdate ? 'Back to Pockit' : 'Create your account'}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={run} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-sm font-medium">{isUpdate ? 'Apply the update' : 'Run the one-time setup'}</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {isUpdate
          ? 'This adds what the newer version needs. Existing transactions, accounts and budgets are left as they are, and it is safe to run more than once.'
          : 'This creates the tables and the security rules. It is safe to run more than once — anything already applied is skipped.'}
      </p>
      {!adminSecretConfigured && (
        <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">
          This deployment has no <code className="font-mono text-xs">ADMIN_SECRET</code> set, so no
          key will work here. Add one in your hosting dashboard and redeploy — an environment
          variable only takes effect on a new deployment.
        </p>
      )}
      <div className="mt-3">
        <Field label="Setup key" hint="The ADMIN_SECRET set on this deployment. Leading and trailing spaces are ignored.">
          <Input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
            required
          />
        </Field>
      </div>
      {state.kind === 'error' && (
        <p className="mt-2 text-sm text-[var(--negative)]">{state.message}</p>
      )}
      <Button type="submit" variant="primary" className="mt-3" disabled={state.kind === 'running' || secret === ''}>
        {state.kind === 'running' ? 'Working…' : isUpdate ? 'Apply update' : 'Run setup'}
      </Button>
    </form>
  );
}

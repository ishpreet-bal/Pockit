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
export function RunSetup() {
  const [secret, setSecret] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setState({ kind: 'running' });
    try {
      const res = await fetch('/api/admin/migrate', {
        method: 'POST',
        headers: { 'x-admin-secret': secret },
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
        <p className="font-medium">Setup finished.</p>
        <p className="mt-1 text-[var(--text-muted)]">
          {state.applied.length === 1
            ? '1 migration was applied.'
            : `${state.applied.length} migrations were applied.`}{' '}
          You can create your account now.
        </p>
        <a
          href="/sign-up"
          className="mt-3 inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-3.5 text-sm font-medium text-[var(--accent-fg)]"
        >
          Create your account
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={run} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-sm font-medium">Run the one-time setup</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        This creates the tables and the security rules. It is safe to run more than once —
        anything already applied is skipped.
      </p>
      <div className="mt-3">
        <Field label="Setup key" hint="The ADMIN_SECRET you set in your hosting dashboard.">
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
        {state.kind === 'running' ? 'Setting up…' : 'Run setup'}
      </Button>
    </form>
  );
}

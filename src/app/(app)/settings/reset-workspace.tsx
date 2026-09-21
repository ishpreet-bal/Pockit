'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Field, Input } from '@/components/ui/primitives';

/**
 * Start over.
 *
 * Three deliberate frictions, because this cannot be undone: it is closed by
 * default, it asks for the workspace name typed out, and it asks for the account
 * password. Each one is there to make sure the person doing this meant to.
 *
 * The copy states exactly what survives. "Reset your data" is not specific enough
 * to consent to — people need to know whether their accounts and categories are
 * about to disappear too.
 */
export function ResetWorkspace({ workspaceName }: { workspaceName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/workspace/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm, password }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not reset this workspace.');
      setDone(true);
      setPassword('');
      setConfirm('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card>
        <CardHeader title="Start over" />
        <CardBody>
          <p className="text-sm">
            <strong>{workspaceName}</strong> is empty. Your account, accounts and categories are
            still here — add a transaction or import a statement whenever you are ready.
          </p>
          <Button variant="primary" className="mt-3" onClick={() => router.push('/overview')}>
            Go to the dashboard
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="border-[var(--negative)]/30">
      <CardHeader
        title="Start over"
        description="Erase everything in this workspace and begin from nothing"
      />
      <CardBody>
        <div className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3.5 py-3 text-sm">
          <p className="flex items-start gap-2 font-medium text-[var(--negative)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
            This permanently deletes your data in <strong>{workspaceName}</strong>.
          </p>
          <div className="mt-2 grid gap-2 text-[var(--text-muted)] sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-[var(--text)]">Deleted</p>
              <ul className="mt-0.5 list-inside list-disc text-xs">
                <li>every transaction</li>
                <li>budgets and goals</li>
                <li>recurring bills and schedules</li>
                <li>imports, rules and insights</li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--text)]">Kept</p>
              <ul className="mt-0.5 list-inside list-disc text-xs">
                <li>your sign-in and profile</li>
                <li>your accounts</li>
                <li>your categories</li>
                <li>your other workspaces</li>
              </ul>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            It cannot be undone. If you only want a copy first, export from the section above.
          </p>
        </div>

        {open ? (
          <div className="mt-4 space-y-3">
            <Field
              label={`Type "${workspaceName}" to confirm`}
              htmlFor="reset-confirm"
            >
              <Input
                id="reset-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                placeholder={workspaceName}
              />
            </Field>
            <Field label="Your password" htmlFor="reset-password">
              <Input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>

            {error ? (
              <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">
                {error}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => { setOpen(false); setConfirm(''); setPassword(''); setError(null); }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={busy || confirm !== workspaceName || password === ''}
                onClick={() => void reset()}
              >
                {busy ? 'Erasing…' : 'Erase everything'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" className="mt-3" onClick={() => setOpen(true)}>
            Start over
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

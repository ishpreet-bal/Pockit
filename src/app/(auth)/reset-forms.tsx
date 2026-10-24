'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardBody, Field, Input, Button, LinkButton } from '@/components/ui/primitives';

function Alert({ children }: { children: React.ReactNode }) {
  return <div role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">{children}</div>;
}

async function post(path: string, body: unknown): Promise<string | null> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? 'Something went wrong. Please try again.';
}

/** Ask for a reset link. The reply is the same whether or not the email has an account. */
export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardBody className="pt-5">
        <h1 className="text-lg font-semibold">Forgot your password?</h1>
        {sent ? (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            If <strong>{email}</strong> has a Pockit account, a link to choose a new password is on its way. It works for an hour.
            Check your spam folder if it doesn&rsquo;t arrive in a few minutes.
          </p>
        ) : (
          <form
            className="mt-4 flex flex-col gap-3.5"
            onSubmit={async (e) => {
              e.preventDefault(); setBusy(true); setError(null);
              const err = await post('/api/auth/forgot', { email });
              setBusy(false);
              if (err) setError(err); else setSent(true);
            }}
          >
            <p className="text-sm text-[var(--text-muted)]">Enter the email you signed up with and we&rsquo;ll send you a link.</p>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            {error ? <Alert>{error}</Alert> : null}
            <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? 'Sending…' : 'Send reset link'}</Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm"><Link href="/sign-in" className="text-[var(--text-muted)] hover:underline">Back to sign in</Link></p>
      </CardBody>
    </Card>
  );
}

/** Choose a new password from the emailed link. */
export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardBody className="pt-5">
        <h1 className="text-lg font-semibold">Choose a new password</h1>
        {done ? (
          <>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Your password is changed, and you&rsquo;ve been signed out everywhere else. Sign in with the new one, on the website or in the app.</p>
            <div className="mt-4"><LinkButton href="/sign-in" variant="primary" className="w-full">Sign in</LinkButton></div>
          </>
        ) : !token ? (
          <div className="mt-3"><Alert>This link is incomplete. Open it again from the email, or <Link href="/forgot-password" className="underline">ask for a new one</Link>.</Alert></div>
        ) : (
          <form
            className="mt-4 flex flex-col gap-3.5"
            onSubmit={async (e) => {
              e.preventDefault(); setBusy(true); setError(null);
              const err = await post('/api/auth/reset', { token, password });
              setBusy(false);
              if (err) setError(err); else setDone(true);
            }}
          >
            <Field label="New password" htmlFor="password" hint="At least 10 characters.">
              <Input id="password" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error ? <Alert>{error}{/expired|used/.test(error) ? <> <Link href="/forgot-password" className="underline">Ask for a new link</Link>.</> : null}</Alert> : null}
            <Button type="submit" variant="primary" disabled={busy || password.length < 10} className="w-full">{busy ? 'Saving…' : 'Save new password'}</Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

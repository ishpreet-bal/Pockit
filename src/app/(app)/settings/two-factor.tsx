'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Copy, Check } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Field, Input } from '@/components/ui/primitives';

interface State { enabled: boolean; pending: boolean; recoveryCodesLeft: number }

/**
 * Turning on two-step verification.
 *
 * Three screens, in the order that stops people locking themselves out: scan, prove
 * it works, then save the recovery codes. The codes are shown once and never again,
 * so that step is deliberately the hardest to skip past.
 */
export function TwoFactor() {
  const [state, setState] = useState<State | null>(null);
  const [setup, setSetup] = useState<{ qrSvg: string; manualKey: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    try {
      const response = await fetch('/api/account/two-factor');
      if (response.ok) setState((await response.json()) as State);
    } catch { /* the card simply shows nothing rather than an error on load */ }
  }

  async function call(method: string, body?: unknown): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/account/two-factor', {
        method,
        ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        setError((json?.error as string) ?? 'That did not work.');
        return null;
      }
      return json;
    } catch {
      setError('Could not reach the server.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function begin() {
    const json = await call('POST');
    if (json) setSetup({ qrSvg: String(json.qrSvg), manualKey: String(json.manualKey) });
  }

  async function confirm() {
    const json = await call('PUT', { code });
    if (!json) return;
    setCodes(json.recoveryCodes as string[]);
    setSetup(null);
    setCode('');
    await refresh();
  }

  async function disable() {
    if (!(await call('DELETE', { password }))) return;
    setPassword('');
    setDisabling(false);
    await refresh();
  }

  return (
    <Card>
      <CardHeader
        title="Two-step verification"
        description="A code from your phone, on top of your password"
      />
      <CardBody className="space-y-3">
        {codes ? (
          <>
            <p className="flex items-start gap-2 text-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--positive)]" />
              <span>
                <strong>Two-step verification is on.</strong> Save these recovery codes somewhere
                safe — each one signs you in once if you lose your phone. They will not be shown again.
              </span>
            </p>
            <ul className="grid grid-cols-2 gap-1.5 rounded-[var(--radius-control)] bg-[var(--surface-2)] p-3 font-mono text-sm">
              {codes.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(codes.join('\n')).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy codes'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCodes(null)}>I have saved them</Button>
            </div>
          </>
        ) : setup ? (
          <>
            <p className="text-sm">
              Scan this with Google Authenticator, 1Password, Authy or any similar app, then type
              the six digits it shows.
            </p>
            <div
              className="w-fit rounded-[var(--radius-control)] bg-white p-3"
              // The SVG is generated on our own server from our own string. It never
              // contains anything a user supplied.
              dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
            />
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--text-muted)]">Cannot scan it?</summary>
              <p className="mt-1.5">
                Enter this key by hand:{' '}
                <code className="break-all rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-xs">
                  {setup.manualKey}
                </code>
              </p>
            </details>
            <Field label="Six-digit code" htmlFor="totp-code">
              <Input
                id="totp-code" value={code} inputMode="numeric" autoComplete="one-time-code"
                placeholder="000000" maxLength={6}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void confirm(); }}
              />
            </Field>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" disabled={busy || code.length < 6} onClick={() => void confirm()}>
                Turn it on
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setSetup(null); setError(null); }}>Cancel</Button>
            </div>
          </>
        ) : state?.enabled ? (
          <>
            <p className="flex items-start gap-2 text-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--positive)]" />
              <span>
                On. You have <strong>{state.recoveryCodesLeft}</strong> unused recovery
                code{state.recoveryCodesLeft === 1 ? '' : 's'} left.
              </span>
            </p>
            {disabling ? (
              <>
                <Field label="Your password" htmlFor="totp-off" hint="Required, so an unlocked laptop is not enough to remove it.">
                  <Input
                    id="totp-off" type="password" value={password} autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <div className="flex gap-2">
                  <Button variant="danger" size="sm" disabled={busy || password === ''} onClick={() => void disable()}>
                    Turn off
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setDisabling(false); setError(null); }}>Keep it on</Button>
                </div>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setDisabling(true)}>Turn off</Button>
            )}
          </>
        ) : (
          <>
            <p className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
              <span>
                Off. Anyone who learns your password can sign in. With this on, they would also
                need your phone.
              </span>
            </p>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void begin()}>
              Set it up
            </Button>
          </>
        )}

        {error ? <p role="alert" className="text-sm text-[var(--negative)]">{error}</p> : null}
      </CardBody>
    </Card>
  );
}

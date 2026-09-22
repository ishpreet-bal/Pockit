'use client';

import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Activity } from 'lucide-react';
import { Button, Card, CardBody, CardHeader } from '@/components/ui/primitives';

interface PockHealth {
  ok: boolean;
  configured: boolean;
  provider: string;
  model: string | null;
  ms: number;
  reply: string | null;
  problems: string[];
}

interface Health {
  provider: { id: string; label: string; live: boolean };
  configured: { twelvedata: boolean; finnhub: boolean };
  probe: { quote: { priceMinor: number; currency: string; asOf: string } | null; historyCandles: number; ms: number };
  ok: boolean;
  problems: string[];
}

/**
 * "Is my market-data key actually working?"
 *
 * Worth a button because the failure mode is invisible: a wrong key and no key look
 * exactly the same on the investing screens — blank prices and an unavailable chart.
 * This makes one real call and reports what came back, so the difference between
 * "not configured" and "configured but rejected" is a sentence rather than a guess.
 */
export function MarketHealth() {
  const [state, setState] = useState<'idle' | 'checking'>('idle');
  const [health, setHealth] = useState<Health | null>(null);
  const [pock, setPock] = useState<PockHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Both integrations at once.
   *
   * They fail the same invisible way — a wrong key and no key both leave the app
   * quietly degraded — so they are worth checking together, from the one screen
   * someone goes to when "I set the variable and nothing changed".
   */
  async function check() {
    setState('checking');
    setError(null);
    try {
      const [market, ai] = await Promise.all([
        fetch('/api/market/health').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/pock/health').then((r) => (r.ok ? r.json() : null)),
      ]);
      if (market) setHealth(market as Health);
      if (ai) setPock(ai as PockHealth);
      if (!market && !ai) setError('The checks did not run. Try again.');
    } catch {
      setError('Could not reach the server to run the check.');
    } finally {
      setState('idle');
    }
  }

  return (
    <Card>
      <CardHeader
        title="Integrations"
        description="Market data and AI — which providers are configured, and whether they answer"
      />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--text-muted)]">Active source:</span>
          <strong>{health?.provider.label ?? 'Run the check to find out'}</strong>
          {health && !health.provider.live ? (
            <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-2xs text-[var(--warning)]">
              sample data, not a real market
            </span>
          ) : null}
        </div>

        {health ? (
          <div className="space-y-2">
            <p className="flex items-start gap-2 text-sm">
              {health.ok
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--positive)]" />
                : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />}
              <span>
                {health.probe.quote
                  ? `A live price came back in ${health.probe.ms}ms, and ${health.probe.historyCandles} history points for the chart.`
                  : 'No live price came back.'}
              </span>
            </p>
            {health.problems.map((problem) => (
              <p key={problem} className="rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-muted)]">
                {problem}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            A wrong key and no key look identical on the investing screens — blank prices either
            way. This tells you which one you have.
          </p>
        )}

        <div className="border-t border-[var(--border)] pt-3">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--text-muted)]">Pock (AI):</span>
            <strong>{pock ? pock.provider : 'Run the check to find out'}</strong>
            {pock?.model ? <span className="text-2xs text-[var(--text-subtle)]">{pock.model}</span> : null}
          </p>
          {pock ? (
            <div className="mt-2 space-y-2">
              <p className="flex items-start gap-2 text-sm">
                {pock.ok
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--positive)]" />
                  : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />}
                <span>
                  {pock.ok
                    ? `The model replied in ${pock.ms}ms, so Pock can answer questions.`
                    : 'Pock cannot answer questions.'}
                </span>
              </p>
              {pock.problems.map((problem) => (
                <p key={problem} className="rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-muted)]">
                  {problem}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <Button size="sm" onClick={() => void check()} disabled={state === 'checking'}>
          <Activity className="h-3.5 w-3.5" />
          {state === 'checking' ? 'Checking…' : 'Check integrations'}
        </Button>

        {error ? <p role="alert" className="text-sm text-[var(--negative)]">{error}</p> : null}
      </CardBody>
    </Card>
  );
}

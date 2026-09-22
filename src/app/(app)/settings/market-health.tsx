'use client';

import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Activity } from 'lucide-react';
import { Button, Card, CardBody, CardHeader } from '@/components/ui/primitives';

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
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setState('checking');
    setError(null);
    try {
      const response = await fetch('/api/market/health');
      if (!response.ok) throw new Error(String(response.status));
      setHealth((await response.json()) as Health);
    } catch {
      setError('Could not reach the server to run the check.');
    } finally {
      setState('idle');
    }
  }

  return (
    <Card>
      <CardHeader
        title="Market data"
        description="Which provider the investing section is using, and whether it is answering"
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

        <Button size="sm" onClick={() => void check()} disabled={state === 'checking'}>
          <Activity className="h-3.5 w-3.5" />
          {state === 'checking' ? 'Checking…' : 'Check market data'}
        </Button>

        {error ? <p role="alert" className="text-sm text-[var(--negative)]">{error}</p> : null}
      </CardBody>
    </Card>
  );
}

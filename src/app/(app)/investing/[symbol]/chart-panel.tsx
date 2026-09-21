'use client';

import { useEffect, useState } from 'react';
import { PriceChart, type ChartPoint, type Range } from '@/components/market/price-chart';
import { Provenance } from '@/components/market/provenance';

/**
 * The chart and its range control.
 *
 * Owns its own fetching so switching range costs one small request rather than a
 * full page re-render. The first range is rendered from data the server already had,
 * so the chart is on screen immediately rather than after a round trip.
 */
export function ChartPanel({
  symbol, currency, initial, initialRange, sourceLabel,
}: {
  symbol: string;
  currency: string;
  initial: { points: ChartPoint[]; asOf: string | null; simulated: boolean; available: boolean };
  initialRange: Range;
  sourceLabel: string;
}) {
  const [range, setRange] = useState<Range>(initialRange);
  const [state, setState] = useState(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (range === initialRange) { setState(initial); return; }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/market/history?symbol=${encodeURIComponent(symbol)}&range=${range}`);
        const body = (await res.json()) as {
          available?: boolean; points?: ChartPoint[]; asOf?: string; simulated?: boolean;
        };
        if (cancelled) return;
        setState({
          points: body.points ?? [],
          asOf: body.asOf ?? null,
          simulated: body.simulated ?? true,
          available: body.available ?? false,
        });
      } catch {
        if (!cancelled) setState({ points: [], asOf: null, simulated: true, available: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [range, symbol, initial, initialRange]);

  return (
    <div>
      <PriceChart
        points={state.points}
        currency={currency}
        range={range}
        onRangeChange={setRange}
        loading={loading}
      />
      {state.available ? (
        <Provenance
          source={sourceLabel}
          asOf={state.asOf}
          simulated={state.simulated}
          className="mt-2"
          note="prices may be delayed"
        />
      ) : null}
    </div>
  );
}

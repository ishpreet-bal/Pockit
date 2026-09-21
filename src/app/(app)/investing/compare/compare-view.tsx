'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { Change } from '@/components/market/change';
import { Provenance } from '@/components/market/provenance';
import { formatMoney } from '@/lib/money';

export interface CompareSeries {
  symbol: string;
  name: string;
  kind: 'stock' | 'etf' | 'crypto';
  currency: string;
  priceMinor: number | null;
  changeBps: number | null;
  expenseRatioBps: number | null;
  tracks: string | null;
  sector: string | null;
  points: { t: string; pct: number }[];
}

export function CompareView({
  series, sourceLabel, live,
}: { series: CompareSeries[]; sourceLabel: string; live: boolean }) {
  // One row per date, one column per symbol — the shape Recharts needs for
  // overlaid lines that share an axis.
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.t)))].sort();
  const merged = dates.map((t) => {
    const row: Record<string, string | number> = { t };
    for (const s of series) {
      const point = s.points.find((p) => p.t === t);
      if (point) row[s.symbol] = Number(point.pct.toFixed(2));
    }
    return row;
  });

  const anyHistory = merged.length > 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Performance"
          description="Rebased so each starts at 0% — the only way different prices compare"
        />
        <CardBody>
          {anyHistory ? (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={merged} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="2 4" />
                  <XAxis
                    dataKey="t" tickLine={false} axisLine={false} minTickGap={56}
                    tickFormatter={(v: string) => new Date(v).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
                  />
                  <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 12, fontSize: 12,
                    }}
                    // Recharts types these loosely across versions, so the values are
                    // narrowed here rather than asserted at the call site.
                    formatter={(value, name) => {
                      const n = Number(value);
                      return [`${n > 0 ? '+' : ''}${n}%`, String(name)];
                    }}
                    labelFormatter={(label) =>
                      new Date(String(label)).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  />
                  {series.map((s, i) => (
                    <Line
                      key={s.symbol} type="monotone" dataKey={s.symbol}
                      stroke={`var(--chart-${(i % 8) + 1})`} strokeWidth={2} dot={false}
                      isAnimationActive={false} connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              No price history available from the connected source, so there is nothing to plot.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-3">
            {series.map((s, i) => (
              <span key={s.symbol} className="inline-flex items-center gap-1.5 text-xs">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--chart-${(i % 8) + 1})` }} />
                <strong className="pk-display">{s.symbol}</strong>
                <span className="text-[var(--text-muted)]">{s.name}</span>
              </span>
            ))}
          </div>
          <Provenance source={sourceLabel} asOf={new Date().toISOString()} simulated={!live} className="mt-2" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Side by side" />
        <CardBody className="px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-2xs uppercase tracking-wide text-[var(--text-subtle)]">
                  <th className="py-2 pl-5 pr-3 text-left font-medium">Metric</th>
                  {series.map((s) => (
                    <th key={s.symbol} className="px-3 py-2 text-right font-medium">{s.symbol}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="Price" series={series} render={(s) =>
                  s.priceMinor === null ? '—' : formatMoney(BigInt(Math.round(s.priceMinor)), s.currency)} />
                <tr className="border-b border-[var(--border)]">
                  <td className="py-2.5 pl-5 pr-3 text-[var(--text-muted)]">Today</td>
                  {series.map((s) => (
                    <td key={s.symbol} className="px-3 py-2.5 text-right"><Change bps={s.changeBps} /></td>
                  ))}
                </tr>
                <Row label="Type" series={series} render={(s) =>
                  s.kind === 'etf' ? 'Fund' : s.kind === 'crypto' ? 'Crypto' : 'Share'} />
                <Row label="Expense ratio" series={series} render={(s) =>
                  s.expenseRatioBps != null ? `${(s.expenseRatioBps / 100).toFixed(2)}%` : '—'} />
                <Row label="Tracks" series={series} render={(s) => s.tracks ?? '—'} />
                <Row label="Sector" series={series} render={(s) => s.sector ?? '—'} />
                <Row label="Change over the window" series={series} render={(s) => {
                  const last = s.points[s.points.length - 1];
                  return last ? `${last.pct > 0 ? '+' : ''}${last.pct.toFixed(1)}%` : '—';
                }} />
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({
  label, series, render,
}: { label: string; series: CompareSeries[]; render: (s: CompareSeries) => string }) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="py-2.5 pl-5 pr-3 text-[var(--text-muted)]">{label}</td>
      {series.map((s) => (
        <td key={s.symbol} className="tabular px-3 py-2.5 text-right font-medium">{render(s)}</td>
      ))}
    </tr>
  );
}

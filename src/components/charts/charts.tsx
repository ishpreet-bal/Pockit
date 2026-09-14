'use client';

import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { formatMoney } from '@/lib/money';

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)'];

function money(value: number, currency: string) {
  return formatMoney(BigInt(Math.round(value * 100)), currency, { cents: 'auto', compact: Math.abs(value) >= 10000 });
}

/**
 * Recharts injects `active`, `payload` and `label` when this is passed as the
 * `content` element, so they are declared optional here rather than imported from
 * Recharts' own props type, which is not stable across versions.
 */
interface TooltipEntry { dataKey?: string | number; name?: string | number; value?: number | string; color?: string }

function ChartTooltip({
  active, payload, label, currency,
}: { active?: boolean; payload?: TooltipEntry[]; label?: string | number; currency: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-[var(--shadow-sm)]">
      {label ? <p className="mb-1 font-medium text-[var(--text)]">{label}</p> : null}
      {payload.map((entry: TooltipEntry) => (
        <div key={String(entry.dataKey)} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-[var(--text-muted)]">{entry.name}</span>
          <span className="tabular ml-auto font-medium text-[var(--text)]">{money(Number(entry.value ?? 0), currency)}</span>
        </div>
      ))}
    </div>
  );
}

const AXIS = { stroke: 'transparent', tickLine: false, axisLine: false } as const;

export function IncomeExpenseChart({
  data, currency,
}: { data: { label: string; income: number; expenses: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barGap={2}>
        <CartesianGrid vertical={false} strokeDasharray="0" />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} tickCount={4} tickFormatter={(v) => money(Number(v), currency)} width={58} />
        <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: 'var(--surface-2)' }} />
        <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 8 }} />
        <Bar dataKey="income" name="Income" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={26} />
        <Bar dataKey="expenses" name="Expenses" fill="var(--chart-3)" radius={[3, 3, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CashFlowChart({
  data, currency,
}: { data: { label: string; net: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="pk-net" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} tickCount={4} tickFormatter={(v) => money(Number(v), currency)} width={58} />
        <Tooltip content={<ChartTooltip currency={currency} />} />
        <Area type="monotone" dataKey="net" name="Net cash flow" stroke="var(--chart-1)" strokeWidth={2} fill="url(#pk-net)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryPie({
  data, currency,
}: { data: { name: string; value: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} strokeWidth={0}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip content={<ChartTooltip currency={currency} />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BalanceProjectionChart({
  data, currency,
}: { data: { label: string; balance: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} tickCount={4} tickFormatter={(v) => money(Number(v), currency)} width={58} />
        <Tooltip content={<ChartTooltip currency={currency} />} />
        <Line type="monotone" dataKey="balance" name="Projected balance" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export { CHART_COLORS };

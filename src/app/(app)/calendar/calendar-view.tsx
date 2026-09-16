'use client';

import { useState } from 'react';
import { Card, Badge } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/ui/cn';

export interface CalendarEvent {
  date: string;
  name: string;
  /** Serialised bigint — server components cannot pass bigint to the client. */
  amountMinor: string;
  kind: 'income' | 'bill' | 'saving';
  confirmed: boolean;
  recurring?: boolean;
  category: string | null;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * A financial calendar, not a diary.
 *
 * Selecting a day shows what happens financially on it, with a running effect on the
 * day's net position — the question people actually have is "what is going out, and
 * what is left", not "what is in my calendar".
 */
export function CalendarView({
  monthLabel, cells, events, today, currency, locale,
}: {
  monthLabel: string;
  cells: (string | null)[];
  events: CalendarEvent[];
  today: string;
  currency: string;
  locale: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date);
    if (list) list.push(e); else byDate.set(e.date, [e]);
  }

  const dayNet = (date: string) =>
    (byDate.get(date) ?? []).reduce(
      (sum, e) => sum + (e.kind === 'income' ? BigInt(e.amountMinor) : -BigInt(e.amountMinor)),
      0n,
    );

  const monthIn = events.filter((e) => e.kind === 'income')
    .reduce((s, e) => s + BigInt(e.amountMinor), 0n);
  const monthOut = events.filter((e) => e.kind !== 'income')
    .reduce((s, e) => s + BigInt(e.amountMinor), 0n);

  const selectedEvents = selected ? byDate.get(selected) ?? [] : [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <div className="flex gap-5 text-sm">
          <span className="text-[var(--text-muted)]">
            In <Money minor={monthIn} currency={currency} size="sm" tone="income" />
          </span>
          <span className="text-[var(--text-muted)]">
            Out <Money minor={monthOut} currency={currency} size="sm" tone="expense" />
          </span>
          <span className="text-[var(--text-muted)]">
            Net <Money minor={monthIn - monthOut} currency={currency} size="sm" />
          </span>
        </div>
      </div>

      {/* Desktop: a month grid. Phones get an agenda instead — seven columns of
          financial detail is unreadable at that width. */}
      <Card className="hidden overflow-hidden sm:block">
        <div className="grid grid-cols-7 border-b border-[var(--border)]">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-center text-2xs font-medium uppercase tracking-[0.06em] text-[var(--text-subtle)]">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            if (!date) return <div key={`pad-${i}`} className="min-h-[92px] border-b border-r border-[var(--border)] bg-[var(--surface-2)]/30" />;
            const dayEvents = byDate.get(date) ?? [];
            const net = dayNet(date);
            const isToday = date === today;
            const isSelected = date === selected;

            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(isSelected ? null : date)}
                aria-pressed={isSelected}
                className={cn(
                  'min-h-[92px] border-b border-r border-[var(--border)] p-1.5 text-left transition-colors',
                  'hover:bg-[var(--surface-2)]',
                  isSelected && 'bg-[var(--accent-soft)]',
                )}
              >
                <span className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs',
                  isToday ? 'bg-[var(--accent)] font-semibold text-[var(--accent-fg)]' : 'text-[var(--text-muted)]',
                )}>
                  {Number(date.slice(8, 10))}
                </span>

                {dayEvents.length > 0 ? (
                  <>
                    <span className="mt-1 block text-2xs tabular font-medium"
                      style={{ color: net >= 0n ? 'var(--positive)' : 'var(--text-muted)' }}>
                      {net >= 0n ? '+' : '−'}{formatMoney(net < 0n ? -net : net, currency, { compact: true })}
                    </span>
                    <span className="mt-0.5 block truncate text-2xs text-[var(--text-subtle)]">
                      {dayEvents[0]!.name}
                      {dayEvents.length > 1 ? ` +${dayEvents.length - 1}` : ''}
                    </span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Day detail */}
      {selected ? (
        <Card>
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <h3 className="text-sm font-semibold">
              {new Date(`${selected}T12:00:00Z`).toLocaleDateString(locale, {
                weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
              })}
            </h3>
            <button type="button" onClick={() => setSelected(null)}
              className="text-xs text-[var(--text-muted)] hover:underline">Close</button>
          </div>
          {selectedEvents.length === 0 ? (
            <p className="px-4 py-4 text-sm text-[var(--text-muted)]">Nothing financial on this day.</p>
          ) : (
            <ul>
              {selectedEvents.map((e, i) => (
                <li key={`${e.name}-${i}`} className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {e.name}
                      {!e.confirmed ? <Badge tone="info">{e.recurring ? 'repeats' : 'scheduled'}</Badge> : null}
                    </p>
                    {e.category ? <p className="truncate text-xs text-[var(--text-subtle)]">{e.category}</p> : null}
                  </div>
                  <Money
                    minor={e.kind === 'income' ? BigInt(e.amountMinor) : -BigInt(e.amountMinor)}
                    currency={currency} size="sm"
                  />
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 bg-[var(--surface-2)] px-4 py-2.5 text-sm font-medium">
                <span>Net for the day</span>
                <Money minor={dayNet(selected)} currency={currency} size="sm" />
              </li>
            </ul>
          )}
        </Card>
      ) : null}

      {/* Agenda: the only view on phones, and a useful list on desktop too. */}
      <div className="sm:hidden">
        <Card className="overflow-hidden">
          {[...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayEvents]) => (
            <div key={date} className="border-b border-[var(--border)] last:border-0">
              <p className={cn(
                'bg-[var(--surface-2)] px-4 py-1.5 text-xs font-medium',
                date === today ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
              )}>
                {new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
                  weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
                })}
                {date === today ? ' · Today' : ''}
              </p>
              <ul>
                {dayEvents.map((e, i) => (
                  <li key={`${e.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm">
                        {e.name}
                        {!e.confirmed ? <Badge tone="info">{e.recurring ? 'repeats' : 'scheduled'}</Badge> : null}
                      </p>
                    </div>
                    <Money
                      minor={e.kind === 'income' ? BigInt(e.amountMinor) : -BigInt(e.amountMinor)}
                      currency={currency} size="sm"
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      </div>

      <p className="text-xs text-[var(--text-subtle)]">
        Transfers between your own accounts are not shown — moving money between them is neither
        income nor spending.
      </p>
    </div>
  );
}

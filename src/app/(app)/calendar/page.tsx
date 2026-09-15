import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { Card, CardHeader, CardBody, EmptyState, Badge, LinkButton } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { detectRecurring, upcomingOccurrences, isExternalCashMovement } from '@/lib/finance/recurring';
import {
  todayIn, startOfMonth, endOfMonth, addMonths, daysInRange, dayOfWeek, isWeekend,
} from '@/lib/finance/period';
import { formatMoney, sumMinor } from '@/lib/money';
import type { IsoDate } from '@/lib/finance/types';

export const metadata: Metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default async function CalendarPage({
  searchParams,
}: { searchParams: Promise<{ month?: string }> }) {
  const { user, workspace } = await requireAuth();
  const params = await searchParams;
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const cur = workspace.baseCurrency;

  const offset = Number.isFinite(Number(params.month)) ? Number(params.month) : 0;
  const anchor = addMonths(today, Math.max(-24, Math.min(24, offset)));
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);

  const [txns, accounts, categories] = await Promise.all([
    repo.listTransactions(), repo.listAccounts(), repo.listCategories(),
  ]);

  if (txns.length === 0) {
    return (
      <>
        <PageHeader title="Calendar" />
        <div className="px-4 py-8 sm:px-6">
          <Card>
            <EmptyState
              icon="▦"
              title="Nothing scheduled yet"
              description="Paydays, bills and subscriptions appear here once Pockit has seen enough history to recognise them repeating."
              action={<LinkButton href="/imports/new" variant="primary">Import a file</LinkButton>}
            />
          </Card>
        </div>
      </>
    );
  }

  const normalBalance = new Map(accounts.map((a) => [a.id, a.normalBalance]));
  const series = detectRecurring(txns, today, undefined, normalBalance);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // Expected future events plus what already happened this month, in one timeline.
  const expected = upcomingOccurrences(series, monthStart, monthEnd).filter(isExternalCashMovement);

  interface Event {
    date: IsoDate; name: string; amountMinor: bigint;
    kind: 'income' | 'bill' | 'saving'; actual: boolean; category: string | null;
  }

  const events: Event[] = [];

  for (const occ of expected) {
    if (occ.date < today) continue; // already happened; the actual row below covers it
    events.push({
      date: occ.date,
      name: occ.name,
      amountMinor: occ.amountMinor,
      kind: occ.type === 'income' ? 'income' : occ.direction === 'inflow' ? 'income' : occ.type === 'investment' ? 'saving' : 'bill',
      actual: false,
      category: occ.categoryId ? categoryById.get(occ.categoryId)?.name ?? null : null,
    });
  }

  for (const t of txns) {
    if (t.postedDate < monthStart || t.postedDate > monthEnd) continue;
    if (!t.isRecurring) continue;
    if (t.type === 'transfer' || t.type === 'debt_payment') continue;
    // Only the leg that actually left an account; the arriving leg is the same money.
    const leavesAccount = normalBalance.get(t.accountId) === 'credit'
      ? t.amountMinor > 0n
      : t.amountMinor < 0n;
    if (!leavesAccount && t.type !== 'income' && t.type !== 'refund') continue;
    events.push({
      date: t.postedDate,
      name: t.merchantName ?? t.description,
      amountMinor: t.baseAmountMinor < 0n ? -t.baseAmountMinor : t.baseAmountMinor,
      kind: t.type === 'income' ? 'income' : t.type === 'investment' ? 'saving' : 'bill',
      actual: true,
      category: t.categoryId ? categoryById.get(t.categoryId)?.name ?? null : null,
    });
  }

  const byDate = new Map<IsoDate, Event[]>();
  for (const e of events) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }

  // Pad the grid so the 1st lands under its weekday (Monday-first).
  const leading = (dayOfWeek(monthStart) + 6) % 7;
  const cells: (IsoDate | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...daysInRange({ start: monthStart, end: monthEnd }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const incomeTotal = sumMinor(events.filter((e) => e.kind === 'income').map((e) => e.amountMinor));
  const billsTotal = sumMinor(events.filter((e) => e.kind === 'bill').map((e) => e.amountMinor));
  const savingTotal = sumMinor(events.filter((e) => e.kind === 'saving').map((e) => e.amountMinor));

  const monthLabel = new Date(`${monthStart}T12:00:00Z`)
    .toLocaleDateString(user.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Expected paydays, bills and contributions. Dotted items have not happened yet."
        action={
          <div className="flex items-center gap-1">
            <LinkButton href={`/calendar?month=${offset - 1}`} size="sm">←</LinkButton>
            <LinkButton href="/calendar?month=0" size="sm">Today</LinkButton>
            <LinkButton href={`/calendar?month=${offset + 1}`} size="sm">→</LinkButton>
          </div>
        }
      />

      <div className="space-y-4 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{monthLabel}</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="text-[var(--text-muted)]">Income <Money minor={incomeTotal} currency={cur} size="sm" tone="income" /></span>
            <span className="text-[var(--text-muted)]">Bills <Money minor={billsTotal} currency={cur} size="sm" tone="expense" /></span>
            <span className="text-[var(--text-muted)]">Saving <Money minor={savingTotal} currency={cur} size="sm" tone="plain" /></span>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="hidden grid-cols-7 border-b border-[var(--border)] sm:grid">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-1.5 text-center text-2xs font-medium uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                {d}
              </div>
            ))}
          </div>

          {/* A month grid on desktop; an agenda list on phones, where 7 columns are unreadable. */}
          <div className="hidden grid-cols-7 sm:grid">
            {cells.map((date, i) => {
              const dayEvents = date ? byDate.get(date) ?? [] : [];
              const isToday = date === today;
              return (
                <div
                  key={date ?? `pad-${i}`}
                  className={`min-h-[104px] border-b border-r border-[var(--border)] p-1.5 ${
                    !date ? 'bg-[var(--surface-2)]/40'
                    : isWeekend(date) ? 'bg-[var(--surface-2)]/30' : ''
                  }`}
                >
                  {date ? (
                    <>
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                        isToday ? 'bg-[var(--accent)] font-semibold text-[var(--accent-fg)]' : 'text-[var(--text-muted)]'
                      }`}>
                        {Number(date.slice(8, 10))}
                      </span>
                      <ul className="mt-1 space-y-0.5">
                        {dayEvents.slice(0, 3).map((e, j) => (
                          <li
                            key={`${e.name}-${j}`}
                            title={`${e.name} · ${formatMoney(e.amountMinor, cur)}`}
                            className={`truncate rounded px-1 py-0.5 text-2xs ${
                              e.kind === 'income' ? 'bg-[var(--positive-soft)] text-[var(--positive)]'
                              : e.kind === 'saving' ? 'bg-[var(--info-soft)] text-[var(--info)]'
                              : 'bg-[var(--surface-3)] text-[var(--text-muted)]'
                            } ${e.actual ? '' : 'border border-dashed border-current/40'}`}
                          >
                            {formatMoney(e.amountMinor, cur, { compact: true })} {e.name}
                          </li>
                        ))}
                        {dayEvents.length > 3 ? (
                          <li className="px-1 text-2xs text-[var(--text-subtle)]">+{dayEvents.length - 3} more</li>
                        ) : null}
                      </ul>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="sm:hidden">
            {[...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayEvents]) => (
              <div key={date} className="border-b border-[var(--border)] px-4 py-3">
                <p className={`text-xs font-medium ${date === today ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                  {new Date(`${date}T12:00:00Z`).toLocaleDateString(user.locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                  {date === today ? ' · Today' : ''}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {dayEvents.map((e, j) => (
                    <li key={`${e.name}-${j}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate">{e.name}</span>
                        {e.actual ? null : <Badge tone="neutral">expected</Badge>}
                      </span>
                      <Money minor={e.kind === 'income' ? e.amountMinor : -e.amountMinor} currency={cur} size="sm" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {byDate.size === 0 ? (
              <EmptyState title="Nothing this month" description="Move to another month, or import more history so recurring items can be detected." />
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Legend" />
          <CardBody className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-[var(--positive-soft)]" /> Income</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-[var(--surface-3)]" /> Bill or subscription</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-[var(--info-soft)]" /> Saving or investing</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded border border-dashed border-[var(--text-subtle)]" /> Expected, not yet posted</span>
            <span>Transfers between your own accounts are not shown — they are not money entering or leaving.</span>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

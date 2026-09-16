import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { Card, EmptyState, LinkButton } from '@/components/ui/primitives';
import { CalendarView, type CalendarEvent } from './calendar-view';
import { detectRecurring, upcomingOccurrences, isExternalCashMovement } from '@/lib/finance/recurring';
import { manualScheduleToSeries } from '@/lib/finance/schedule';
import { isScheduled } from '@/lib/finance/position';
import {
  todayIn, startOfMonth, endOfMonth, addMonths, addDays, daysInRange, dayOfWeek,
} from '@/lib/finance/period';
import { absMinor, sumMinor, formatMoney } from '@/lib/money';

export const metadata: Metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: { searchParams: Promise<{ month?: string }> }) {
  const { user, workspace } = await requireAuth();
  const params = await searchParams;
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const cur = workspace.baseCurrency;

  const offset = Number.isFinite(Number(params.month)) ? Math.max(-24, Math.min(24, Number(params.month))) : 0;
  const anchor = addMonths(today, offset);
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);

  const [txns, accounts, categories, manual] = await Promise.all([
    repo.listTransactions(), repo.listAccounts(), repo.listCategories(), repo.listManualSchedules(),
  ]);

  const normalBalance = new Map(accounts.map((a) => [a.id, a.normalBalance]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const series = [
    ...manual.filter((m) => m.isActive).map((m) => manualScheduleToSeries(m, today)),
    ...detectRecurring(txns, today, undefined, normalBalance),
  ];

  const events: CalendarEvent[] = [];

  // What already happened.
  for (const t of txns) {
    if (t.postedDate < monthStart || t.postedDate > monthEnd) continue;
    if (isScheduled(t, today)) continue;
    if (t.type === 'transfer' || t.type === 'debt_payment') continue;
    const leaves = normalBalance.get(t.accountId) === 'credit' ? t.amountMinor > 0n : t.amountMinor < 0n;
    if (!leaves && t.type !== 'income' && t.type !== 'refund') continue;

    events.push({
      date: t.postedDate,
      name: t.merchantName ?? t.description,
      amountMinor: absMinor(t.baseAmountMinor).toString(),
      kind: t.type === 'income' || t.type === 'refund' ? 'income' : t.type === 'investment' ? 'saving' : 'bill',
      confirmed: true,
      category: t.categoryId ? categoryById.get(t.categoryId)?.name ?? null : null,
    });
  }

  // What the user has scheduled themselves.
  for (const t of txns) {
    if (t.postedDate < monthStart || t.postedDate > monthEnd) continue;
    if (!isScheduled(t, today)) continue;
    if (t.type === 'transfer' || t.type === 'debt_payment') continue;
    events.push({
      date: t.postedDate,
      name: t.merchantName ?? t.description,
      amountMinor: absMinor(t.baseAmountMinor).toString(),
      kind: t.type === 'income' ? 'income' : t.type === 'investment' ? 'saving' : 'bill',
      confirmed: false,
      category: t.categoryId ? categoryById.get(t.categoryId)?.name ?? null : null,
    });
  }

  // What repeats.
  for (const occ of upcomingOccurrences(series, monthStart, monthEnd)) {
    if (!isExternalCashMovement(occ)) continue;
    if (occ.date < today) continue; // already covered by the posted rows above
    events.push({
      date: occ.date,
      name: occ.name,
      amountMinor: absMinor(occ.amountMinor).toString(),
      kind: occ.direction === 'inflow' ? 'income' : occ.type === 'investment' ? 'saving' : 'bill',
      confirmed: false,
      recurring: true,
      category: occ.categoryId ? categoryById.get(occ.categoryId)?.name ?? null : null,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  if (events.length === 0 && offset === 0) {
    return (
      <>
        <PageHeader title="Calendar" />
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
          <Card>
            <EmptyState
              icon="▦"
              title="Your financial month, once there is something in it"
              description="Add the bills you already know about and they will appear here with your paydays, so you can see the shape of the month before it happens."
              action={<LinkButton href="/recurring" variant="primary">Add a recurring bill</LinkButton>}
            />
          </Card>
        </div>
      </>
    );
  }

  /* ---- summaries that answer what people actually ask ---- */
  const weekEnd = addDays(today, 7);
  const thisWeek = events.filter((e) => e.date >= today && e.date <= weekEnd);
  const weekBills = thisWeek.filter((e) => e.kind !== 'income');
  const nextPayday = events.find((e) => e.kind === 'income' && e.date >= today);
  const biggest = [...weekBills].sort((a, b) => Number(BigInt(b.amountMinor) - BigInt(a.amountMinor)))[0];

  const summaries: string[] = [];
  if (weekBills.length > 0) {
    summaries.push(
      `You have ${formatMoney(sumMinor(weekBills.map((e) => BigInt(e.amountMinor))), cur)} of expenses in the next 7 days.`,
    );
  }
  if (biggest) {
    summaries.push(`The largest is ${biggest.name} at ${formatMoney(BigInt(biggest.amountMinor), cur)}.`);
  }
  if (nextPayday) {
    const days = Math.round((Date.parse(`${nextPayday.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    summaries.push(
      days === 0 ? `${nextPayday.name} lands today.`
        : `Next money in is ${nextPayday.name} in ${days} day${days === 1 ? '' : 's'}.`,
    );
  }

  const leading = (dayOfWeek(monthStart) + 6) % 7;
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...daysInRange({ start: monthStart, end: monthEnd }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(`${monthStart}T12:00:00Z`)
    .toLocaleDateString(user.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <>
      <PageHeader
        title="Calendar"
        description={summaries.join(' ') || 'Everything going in and out this month.'}
        action={
          <div className="flex items-center gap-1">
            <LinkButton href={`/calendar?month=${offset - 1}`} size="sm">←</LinkButton>
            <LinkButton href="/calendar?month=0" size="sm">Today</LinkButton>
            <LinkButton href={`/calendar?month=${offset + 1}`} size="sm">→</LinkButton>
          </div>
        }
      />
      <CalendarView
        monthLabel={monthLabel}
        cells={cells}
        events={events}
        today={today}
        currency={cur}
        locale={user.locale}
      />
    </>
  );
}

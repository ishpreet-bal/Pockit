import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { WorkspaceRepo } from '@/lib/data/repository';
import { detectRecurring } from '@/lib/finance/recurring';
import { manualScheduleToSeries } from '@/lib/finance/schedule';
import { computePosition, isScheduled } from '@/lib/finance/position';
import { forecast } from '@/lib/finance/forecast';
import { BILL_SLUGS, everydayPerDay, findHabits } from '@/lib/finance/habits';
import { addDays, addMonths, diffDays, endOfMonth, todayIn } from '@/lib/finance/period';

export const dynamic = 'force-dynamic';

const n = (v: bigint) => Number(v);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Where your money is headed, and the everyday habits that decide it.
 *
 * The projection starts from today's everyday money (minus what's owed on cards),
 * adds pay that's expected, takes off bills on their dates, and takes off everyday
 * spending at your recent pace. ?until=YYYY-MM-DD picks the date (default: end of
 * month); up to a year ahead.
 */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { user, workspace } = ctx;
  const today = todayIn(user.timezone);
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const [accounts, categories, allTxns, manual] = await Promise.all([
    repo.listAccounts(), repo.listCategories(), repo.listTransactions(), repo.listManualSchedules(),
  ]);

  const detected = detectRecurring(allTxns, today, undefined, new Map(accounts.map((a) => [a.id, a.normalBalance])), new Map(categories.map((c) => [c.id, c.slug])));
  const series = [...manual.filter((m) => m.isActive).map((m) => manualScheduleToSeries(m, today)), ...detected];
  const position = computePosition({ txns: allTxns, accounts, categories, series, today, currency: workspace.baseCurrency });
  const billIds = new Set(detected.flatMap((s) => s.transactionIds));
  const posted = allTxns.filter((t) => !isScheduled(t, today));

  const asked = new URL(request.url).searchParams.get('until');
  const max = addMonths(today, 12);
  const until = asked && ISO.test(asked) && asked > today ? (asked > max ? max : asked) : endOfMonth(today);
  const horizonDays = Math.max(1, diffDays(today, until));

  const billCategoryIds = new Set(categories.filter((c) => BILL_SLUGS.has(c.slug)).map((c) => c.id));
  const pace = everydayPerDay(posted, today, billIds, { billCategoryIds });
  const f = forecast({
    startingBalanceMinor: position.cashNowMinor, today, horizonDays, series,
    // History without the bills, so the everyday pace doesn't count them twice.
    historyTxns: posted.filter((t) => !billIds.has(t.id)), historyRange: { start: addDays(today, -55), end: today },
    categories,
  });
  // The engine's own rate averages over the whole window even before history began;
  // the pace above uses only the days there is history for, so it isn't understated.
  const everyday = pace * BigInt(horizonDays);
  const projected = position.cashNowMinor + f.expectedIncomeMinor - f.knownExpensesMinor - everyday;

  // A point a week (and the last day), for the little chart.
  const points: { date: string; minor: number }[] = [];
  let running = position.cashNowMinor;
  for (const day of f.days) {
    running = running + day.knownIncomeMinor - day.knownExpenseMinor - (day.date === today ? 0n : pace);
    if (day.date === today || diffDays(today, day.date) % 7 === 0 || day.date === until) points.push({ date: day.date, minor: n(running) });
  }
  const lowest = points.reduce((m, p) => (p.minor < m.minor ? p : m), points[0] ?? { date: today, minor: n(position.cashNowMinor) });

  const habits = findHabits(posted, today, { exclude: billIds });
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const paydays = f.scheduled.filter((s) => (s.direction ? s.direction === 'inflow' : s.type === 'income')).map((s) => s.date);

  return NextResponse.json({
    today, until,
    presets: [
      { label: 'End of month', date: endOfMonth(today) },
      ...(paydays[0] ? [{ label: 'Next payday', date: paydays[0] }] : []),
      { label: 'End of next month', date: endOfMonth(addMonths(today, 1)) },
      { label: 'In 3 months', date: addMonths(today, 3) },
    ].filter((p, i, all) => p.date > today && all.findIndex((q) => q.date === p.date) === i),
    projection: {
      startMinor: n(position.cashNowMinor), incomeMinor: n(f.expectedIncomeMinor), billsMinor: n(f.knownExpensesMinor),
      everydayMinor: n(everyday), perDayMinor: n(pace), projectedMinor: n(projected),
      paydays: paydays.length, lowest, points,
    },
    habits: habits.habits.slice(0, 6).map((h) => ({ name: h.name, rhythm: h.rhythm, perWeekMinor: n(h.perWeekMinor), typicalMinor: n(h.typicalMinor), visits: h.visits, category: h.categoryId ? catName.get(h.categoryId) ?? null : null })),
    perWeek: habits.categories.slice(0, 6).map((c) => ({ category: catName.get(c.categoryId) ?? 'Other', perWeekMinor: n(c.perWeekMinor) })),
    windowDays: habits.windowDays,
  });
}

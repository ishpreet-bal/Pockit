import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { computePosition } from '@/lib/finance/position';
import { detectRecurring } from '@/lib/finance/recurring';
import { manualScheduleToSeries } from '@/lib/finance/schedule';
import { todayIn, startOfMonth, endOfMonth } from '@/lib/finance/period';
import { formatMoney } from '@/lib/money';
import { Companion, type CompanionTip } from '@/components/brand/companion';

/**
 * Decides what Pock has to say, from the same position calculation the dashboard
 * uses — never from a list of generic encouragements.
 *
 * The tips are ordered by how much they matter, and exactly one is ever chosen. A
 * character that queues up five observations is a notification centre with a face.
 *
 * Each tip carries a stable id so "don't show this again" can mean it. Ids include
 * the month where the observation is month-specific, so dismissing October's
 * shortfall warning does not silence November's.
 */
export async function CompanionHost() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const cur = workspace.baseCurrency;
  const month = today.slice(0, 7);

  const [accounts, categories, txns, manual, goals] = await Promise.all([
    repo.listAccounts(), repo.listCategories(), repo.listTransactions(),
    repo.listManualSchedules(), repo.listGoals(),
  ]);

  // A brand new workspace gets the one tip that is actually useful there.
  if (txns.length === 0 && manual.length === 0) {
    return (
      <Companion
        tip={{
          id: 'welcome',
          mood: 'happy',
          text: "I'm Pock. Add a bill or a transaction and I'll start telling you what's coming and what's safe to spend.",
          action: { href: '/recurring', label: 'Add a recurring bill' },
        }}
      />
    );
  }

  const series = [
    ...manual.filter((m) => m.isActive).map((m) => manualScheduleToSeries(m, today)),
    ...detectRecurring(txns, today, undefined, new Map(accounts.map((a) => [a.id, a.normalBalance]))),
  ];

  const position = computePosition({
    txns, accounts, categories, series, today,
    currency: cur,
    period: { start: startOfMonth(today), end: endOfMonth(today) },
  });

  const tip = pickTip({ position, month, cur, goalCount: goals.length, today });
  return <Companion tip={tip} />;
}

function pickTip({
  position, month, cur, goalCount, today,
}: {
  position: ReturnType<typeof computePosition>;
  month: string;
  cur: string;
  goalCount: number;
  /** The workspace's today. Using the server's UTC date instead made Pock say
   *  "due today" beside a card that said "tomorrow". */
  today: string;
}): CompanionTip | null {
  const dueSoon = position.soonCommitments.filter((c) => c.kind !== 'income');

  // 1. Cash that will not cover what is already promised. Nothing outranks this.
  if (position.availableNowMinor < 0n) {
    return {
      id: `short-${month}`,
      mood: 'concerned',
      text:
        `Your bills still to come are ${formatMoney(-position.availableNowMinor, cur)} more than the cash you ` +
        'have. Worth moving something or delaying a payment before it bounces.',
      action: { href: '/calendar', label: 'See what is due' },
    };
  }

  // 2. Heading for a shortfall by month end, which is a warning, not an emergency.
  if (position.leftThisPeriodMinor < 0n) {
    return {
      id: `overspend-${month}`,
      mood: 'concerned',
      text:
        `At this rate the month ends about ${formatMoney(-position.leftThisPeriodMinor, cur)} short. ` +
        'Nothing has gone wrong yet — this is just where the numbers point.',
      action: { href: '/budget', label: 'Look at the budget' },
    };
  }

  // 3. Something large landing within three days.
  const imminent = dueSoon.find((c) => daysBetween(today, c.date) <= 3);
  if (imminent) {
    const days = daysBetween(today, imminent.date);
    const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    return {
      id: `due-${imminent.date}-${imminent.name}`,
      mood: 'thinking',
      text: `${imminent.name} is due ${when} — ${formatMoney(imminent.amountMinor, cur)}.`,
      action: { href: '/calendar', label: 'See the month' },
    };
  }

  // 4. Genuinely doing well. Said once a month, not every visit.
  if (position.leftThisPeriodMinor > 0n && position.spentMinor > 0n && goalCount === 0) {
    return {
      id: `spare-${month}`,
      mood: 'happy',
      text:
        `You are on track to finish the month about ${formatMoney(position.leftThisPeriodMinor, cur)} ahead. ` +
        'Giving that a job now is the difference between saving it and spending it.',
      action: { href: '/goals', label: 'Set a goal' },
    };
  }

  return null;
}

/**
 * Whole days between two ISO dates. Negative means it has already passed.
 *
 * Both sides are parsed as dates rather than using the clock, so this agrees with
 * every other "in N days" in the app, all of which are computed from the
 * workspace's today rather than the server's.
 */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 999;
  return Math.round((b - a) / 86_400_000);
}

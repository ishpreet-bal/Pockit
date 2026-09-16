/**
 * Guided budget planning.
 *
 * The previous budget screen handed the user a set of empty categories and asked them
 * to fill it in. That asks the person who least knows what a reasonable grocery budget
 * looks like to supply one.
 *
 * This builds a concrete, explained starting plan from what is actually known — income,
 * committed bills, real spending history where it exists — and adapts it. Generic rules
 * are a starting point, not an answer: telling someone whose rent is 45% of their income
 * to follow 50/30/20 is useless, so the plan bends around their fixed costs and says so.
 */
import { sumMinor, mulRatio, absMinor } from '@/lib/money';
import type { DateRange, IsoDate, LedgerTxn, LedgerCategory } from './types';
import { spendingByCategory, rollUpCategories, periodTotals } from './ledger';
import { monthsInRange } from './period';

export type BudgetIntent =
  | 'save_more' | 'pay_down_debt' | 'emergency_fund' | 'invest_more'
  | 'big_purchase' | 'control_spending' | 'balanced' | 'custom';

export const BUDGET_INTENTS: { id: BudgetIntent; label: string; blurb: string }[] = [
  { id: 'control_spending', label: 'Understand and control my spending', blurb: 'See where the money goes and keep it in check.' },
  { id: 'save_more', label: 'Save more each month', blurb: 'Put more aside before anything else.' },
  { id: 'emergency_fund', label: 'Build an emergency fund', blurb: 'Get to a few months of expenses in the bank.' },
  { id: 'pay_down_debt', label: 'Pay down debt', blurb: 'Direct spare money at what you owe.' },
  { id: 'invest_more', label: 'Invest more', blurb: 'Grow long-term savings.' },
  { id: 'big_purchase', label: 'Save for something specific', blurb: 'A trip, a car, a deposit.' },
  { id: 'balanced', label: 'A balanced monthly plan', blurb: 'A sensible split across everything.' },
  { id: 'custom', label: 'I will set it up myself', blurb: 'Start from a blank budget.' },
];

export interface PlanInput {
  monthlyIncomeMinor: bigint;
  /** Bills already committed each month — rent, subscriptions, insurance. */
  fixedCostsMinor: bigint;
  intent: BudgetIntent;
  /** Average monthly spend per category, where history exists. */
  historicalByCategory: Map<string, bigint>;
  categories: readonly LedgerCategory[];
  currency: string;
  /** Monthly amount already committed to goals. */
  goalCommitmentMinor?: bigint;
}

export interface PlanLine {
  key: string;
  label: string;
  amountMinor: bigint;
  categoryId: string | null;
  bucket: 'essentials' | 'flexible' | 'savings' | 'investing' | 'debt' | 'goals';
  /** Where this number came from, shown so nothing is unexplained. */
  basis: string;
  editable: boolean;
}

export interface BudgetPlan {
  intent: BudgetIntent;
  monthlyIncomeMinor: bigint;
  fixedCostsMinor: bigint;
  /** Income less committed bills — the amount actually being allocated. */
  availableMinor: bigint;
  lines: PlanLine[];
  unallocatedMinor: bigint;
  /** Plain-language summary of what was decided and why. */
  summary: string;
  /** Honest caveats: tight budgets, thin history, fixed costs out of proportion. */
  notes: string[];
  feasible: boolean;
}

const BUCKET_LABELS: Record<PlanLine['bucket'], string> = {
  essentials: 'Everyday essentials',
  flexible: 'Flexible spending',
  savings: 'Savings',
  investing: 'Investing',
  debt: 'Extra debt payments',
  goals: 'Goal contributions',
};

/**
 * Build a starting plan.
 *
 * The split is derived, not copied from a rule of thumb:
 *   1. Committed bills come off the top — they are not negotiable this month.
 *   2. Essentials are estimated from real history where it exists, and from a
 *      conservative share of what is left where it does not.
 *   3. The intent decides how the REMAINDER is divided, not the whole income.
 */
export function buildPlan(input: PlanInput): BudgetPlan {
  const { monthlyIncomeMinor: income, fixedCostsMinor: fixed, intent, currency } = input;
  const notes: string[] = [];

  const available = income - fixed;
  const fixedShare = income > 0n ? Number((fixed * 100n) / income) : 0;

  if (income <= 0n) {
    return {
      intent, monthlyIncomeMinor: income, fixedCostsMinor: fixed, availableMinor: 0n,
      lines: [], unallocatedMinor: 0n,
      summary: 'Add your monthly income and Pockit can suggest a plan.',
      notes: ['No income recorded yet.'],
      feasible: false,
    };
  }

  if (available <= 0n) {
    return {
      intent, monthlyIncomeMinor: income, fixedCostsMinor: fixed, availableMinor: available,
      lines: [], unallocatedMinor: available,
      summary:
        `Your committed bills of ${fmt(fixed, currency)} already meet or exceed your ${fmt(income, currency)} monthly income. ` +
        `There is nothing left to allocate, so the useful next step is reducing a fixed cost rather than setting spending limits.`,
      notes: ['A budget cannot fix a shortfall this size on its own.'],
      feasible: false,
    };
  }

  // Essentials: use what the user actually spends, when we know it.
  const essentialIds = new Set(
    input.categories.filter((c) => c.necessity === 'essential' && c.kind === 'expense').map((c) => c.id),
  );
  let essentialsFromHistory = 0n;
  for (const [categoryId, amount] of input.historicalByCategory) {
    if (essentialIds.has(categoryId)) essentialsFromHistory += amount;
  }

  const hasHistory = essentialsFromHistory > 0n;
  // Without history, assume essentials take about half of what is left. This is a
  // starting point the user is told about, not a claim about their life.
  let essentials = hasHistory ? essentialsFromHistory : mulRatio(available, 50n, 100n);

  if (essentials > available) {
    notes.push(
      `Your recent essential spending of ${fmt(essentials, currency)} is more than the ${fmt(available, currency)} left after bills. ` +
      `The plan below assumes you can bring it down; if not, the gap has to come from income or fixed costs.`,
    );
    essentials = mulRatio(available, 80n, 100n);
  }

  if (fixedShare >= 45) {
    notes.push(
      `Your fixed bills are ${fixedShare}% of your income. Standard advice assumes around 50% for ALL essentials including rent, ` +
      `so the usual split does not apply to you — this plan works with what is actually left instead.`,
    );
  }

  const remainder = available - essentials;
  const goalCommitment = input.goalCommitmentMinor ?? 0n;

  const lines: PlanLine[] = [
    {
      key: 'essentials',
      label: BUCKET_LABELS.essentials,
      amountMinor: essentials,
      categoryId: null,
      bucket: 'essentials',
      basis: hasHistory
        ? `Your average spending on essentials over recent months`
        : `A starting estimate — half of what is left after bills. Adjust once Pockit sees a month of spending.`,
      editable: true,
    },
  ];

  // The intent divides the REMAINDER, never the whole income.
  const splits = remainderSplit(intent);
  let allocated = 0n;

  for (const split of splits) {
    const amount = roundTo(mulRatio(remainder, BigInt(split.percent), 100n), 500n);
    if (amount <= 0n) continue;
    lines.push({
      key: split.bucket,
      label: BUCKET_LABELS[split.bucket],
      amountMinor: amount,
      categoryId: null,
      bucket: split.bucket,
      basis: split.basis,
      editable: true,
    });
    allocated += amount;
  }

  if (goalCommitment > 0n) {
    const existing = lines.find((l) => l.bucket === 'goals');
    if (existing) existing.amountMinor = existing.amountMinor > goalCommitment ? existing.amountMinor : goalCommitment;
    else {
      lines.push({
        key: 'goals', label: BUCKET_LABELS.goals, amountMinor: goalCommitment,
        categoryId: null, bucket: 'goals',
        basis: 'What your current goals already need each month', editable: true,
      });
      allocated += goalCommitment;
    }
  }

  const unallocated = remainder - allocated;
  if (unallocated > 0n) {
    const flexible = lines.find((l) => l.bucket === 'flexible');
    if (flexible) flexible.amountMinor += unallocated;
  }

  const totalAllocated = sumMinor(lines.map((l) => l.amountMinor));

  return {
    intent,
    monthlyIncomeMinor: income,
    fixedCostsMinor: fixed,
    availableMinor: available,
    lines,
    unallocatedMinor: available - totalAllocated,
    summary: buildSummary(income, fixed, available, lines, currency),
    notes,
    feasible: true,
  };
}

/** How the remainder is divided, by intent. Percentages are of what is LEFT. */
function remainderSplit(intent: BudgetIntent): { bucket: PlanLine['bucket']; percent: number; basis: string }[] {
  switch (intent) {
    case 'save_more':
      return [
        { bucket: 'savings', percent: 55, basis: 'Prioritised, because saving more is what you said you wanted' },
        { bucket: 'flexible', percent: 45, basis: 'What is left for day-to-day choices' },
      ];
    case 'emergency_fund':
      return [
        { bucket: 'savings', percent: 60, basis: 'Directed at your emergency fund until it is built' },
        { bucket: 'flexible', percent: 40, basis: 'What is left for day-to-day choices' },
      ];
    case 'pay_down_debt':
      return [
        { bucket: 'debt', percent: 55, basis: 'Above your minimum payments, to clear the balance sooner' },
        { bucket: 'savings', percent: 10, basis: 'A small buffer, so a surprise does not undo the progress' },
        { bucket: 'flexible', percent: 35, basis: 'What is left for day-to-day choices' },
      ];
    case 'invest_more':
      return [
        { bucket: 'investing', percent: 50, basis: 'Long-term investing, as you asked' },
        { bucket: 'savings', percent: 15, basis: 'Kept liquid for the short term' },
        { bucket: 'flexible', percent: 35, basis: 'What is left for day-to-day choices' },
      ];
    case 'big_purchase':
      return [
        { bucket: 'goals', percent: 55, basis: 'Towards what you are saving for' },
        { bucket: 'savings', percent: 10, basis: 'A general buffer' },
        { bucket: 'flexible', percent: 35, basis: 'What is left for day-to-day choices' },
      ];
    case 'control_spending':
      return [
        { bucket: 'flexible', percent: 60, basis: 'A clear ceiling for discretionary spending' },
        { bucket: 'savings', percent: 40, basis: 'Whatever you keep under that ceiling' },
      ];
    case 'balanced':
    case 'custom':
    default:
      return [
        { bucket: 'savings', percent: 35, basis: 'A steady share put aside' },
        { bucket: 'investing', percent: 15, basis: 'A smaller share invested long-term' },
        { bucket: 'flexible', percent: 50, basis: 'What is left for day-to-day choices' },
      ];
  }
}

function buildSummary(
  income: bigint, fixed: bigint, available: bigint, lines: readonly PlanLine[], currency: string,
): string {
  const named = lines
    .filter((l) => l.bucket !== 'essentials' && l.amountMinor > 0n)
    .map((l) => `${fmt(l.amountMinor, currency)} ${l.label.toLowerCase()}`);

  return (
    `You bring in about ${fmt(income, currency)} a month and ${fmt(fixed, currency)} is already committed to bills, ` +
    `leaving ${fmt(available, currency)} to work with. ` +
    (named.length > 0 ? `This plan puts ${joinList(named)}.` : '')
  );
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Round to the nearest $5 so a suggestion reads as a decision, not a computation. */
function roundTo(minor: bigint, step: bigint): bigint {
  if (step <= 0n) return minor;
  const half = step / 2n;
  return ((minor + half) / step) * step;
}

function fmt(minor: bigint, currency: string): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const symbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
  const dollars = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = abs % 100n;
  return `${neg ? '−' : ''}${symbol}${dollars}${cents === 0n ? '' : `.${cents.toString().padStart(2, '0')}`}`;
}

/* ------------------------------------------------------------------ */
/* Inputs derived from the ledger                                      */
/* ------------------------------------------------------------------ */

export interface PlanContext {
  monthlyIncomeMinor: bigint;
  historicalByCategory: Map<string, bigint>;
  monthsOfHistory: number;
}

/** What Pockit already knows, so the wizard can prefill rather than interrogate. */
export function derivePlanContext(
  txns: readonly LedgerTxn[],
  categories: readonly LedgerCategory[],
  range: DateRange,
): PlanContext {
  const inRange = txns.filter((t) => t.postedDate >= range.start && t.postedDate <= range.end);
  const months = BigInt(Math.max(1, monthsInRange(range).length));
  const totals = periodTotals(inRange);

  const leaf = spendingByCategory(inRange);
  const rolled = rollUpCategories(leaf, categories);
  const byCategory = new Map<string, bigint>();
  for (const [categoryId, amount] of rolled) {
    if (amount > 0n) byCategory.set(categoryId, absMinor(amount) / months);
  }

  return {
    monthlyIncomeMinor: totals.income / months,
    historicalByCategory: byCategory,
    monthsOfHistory: Number(months),
  };
}

export function planToAllocations(plan: BudgetPlan): { label: string; amountMinor: bigint; bucket: string }[] {
  return plan.lines.map((l) => ({ label: l.label, amountMinor: l.amountMinor, bucket: l.bucket }));
}

export function estimateMonthlyFixedCosts(
  schedules: readonly { amountMinor: bigint; monthlyMinor?: bigint }[],
): bigint {
  return sumMinor(schedules.map((s) => s.monthlyMinor ?? s.amountMinor));
}

export type { IsoDate };

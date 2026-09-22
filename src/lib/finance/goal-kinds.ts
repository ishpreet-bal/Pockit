import type { IsoDate } from './types';

/**
 * What kind of goal this is, and what that actually changes.
 *
 * The `kind` column has existed since the schema was written and was never read.
 * That is why every goal produced the same commentary: nothing in the analysis
 * asked what it was looking at, so an emergency fund and a holiday were reasoned
 * about identically.
 *
 * The differences below are substantive, not tonal:
 *
 *  - An emergency fund's target is not a number someone picks; it is a multiple of
 *    their monthly outgoings, so the app can say whether the target is even right.
 *  - Debt payoff is the one goal where DELAY HAS A PRICE — interest accrues — so
 *    "just extend the date" is the wrong advice there and the right advice almost
 *    everywhere else.
 *  - A holiday is fully discretionary: moving the date costs nothing but time,
 *    which makes it the first thing to deprioritise when several goals compete.
 *  - A house deposit is usually a percentage of a purchase price, and a shortfall
 *    matters differently because the purchase is typically date-driven by a lease.
 *  - Tuition has an externally fixed deadline that cannot be moved at all.
 */
export type GoalKind =
  | 'emergency_fund' | 'vacation' | 'car' | 'house' | 'tuition'
  | 'investment' | 'business_capital' | 'debt_payoff' | 'general' | 'custom';

export interface KindProfile {
  kind: GoalKind;
  label: string;
  /** Can the target date move without a real-world cost? Drives which advice is honest. */
  deadlineFlexible: boolean;
  /** Does waiting cost money, rather than just time? */
  delayHasFinancialCost: boolean;
  /** Should this be funded before discretionary goals? */
  priorityOverDiscretionary: boolean;
  /**
   * For goals whose target SHOULD be derived rather than chosen, how many months of
   * outgoings the target represents. Null where the target is genuinely arbitrary.
   */
  targetAsMonthsOfExpenses: { min: number; max: number } | null;
  /** The question this kind of goal actually raises, used to steer the analysis. */
  centralQuestion: string;
}

export const KIND_PROFILES: Record<GoalKind, KindProfile> = {
  emergency_fund: {
    kind: 'emergency_fund',
    label: 'emergency fund',
    deadlineFlexible: true,
    delayHasFinancialCost: false,
    priorityOverDiscretionary: true,
    targetAsMonthsOfExpenses: { min: 3, max: 6 },
    centralQuestion: 'Is the target the right size for THIS person\'s outgoings, and how many months of cover do they have today?',
  },
  debt_payoff: {
    kind: 'debt_payoff',
    label: 'debt payoff',
    deadlineFlexible: false,
    delayHasFinancialCost: true,
    priorityOverDiscretionary: true,
    targetAsMonthsOfExpenses: null,
    centralQuestion: 'What does extending this cost in interest, and should it be funded ahead of every other goal here?',
  },
  tuition: {
    kind: 'tuition',
    label: 'tuition',
    deadlineFlexible: false,
    delayHasFinancialCost: false,
    priorityOverDiscretionary: true,
    targetAsMonthsOfExpenses: null,
    centralQuestion: 'The deadline is set by a term date and cannot move, so the only levers are the amount and the monthly contribution.',
  },
  house: {
    kind: 'house',
    label: 'house deposit',
    deadlineFlexible: true,
    delayHasFinancialCost: false,
    priorityOverDiscretionary: true,
    targetAsMonthsOfExpenses: null,
    centralQuestion: 'Is the deposit target consistent with a purchase price, and does the timeline survive the current pace?',
  },
  car: {
    kind: 'car',
    label: 'car',
    deadlineFlexible: true,
    delayHasFinancialCost: false,
    priorityOverDiscretionary: false,
    targetAsMonthsOfExpenses: null,
    centralQuestion: 'Is this replacing something essential or upgrading, and would a smaller target reach the date without cuts?',
  },
  vacation: {
    kind: 'vacation',
    label: 'holiday',
    deadlineFlexible: true,
    delayHasFinancialCost: false,
    priorityOverDiscretionary: false,
    targetAsMonthsOfExpenses: null,
    centralQuestion: 'This is discretionary, so moving the date or trimming the target is cheaper than cutting essentials for it.',
  },
  investment: {
    kind: 'investment',
    label: 'investment contribution',
    deadlineFlexible: true,
    delayHasFinancialCost: false,
    priorityOverDiscretionary: false,
    targetAsMonthsOfExpenses: null,
    centralQuestion: 'Is there an emergency buffer and no high-interest debt first? Investing before those is usually the wrong order.',
  },
  business_capital: {
    kind: 'business_capital',
    label: 'business capital',
    deadlineFlexible: true,
    delayHasFinancialCost: false,
    priorityOverDiscretionary: false,
    targetAsMonthsOfExpenses: null,
    centralQuestion: 'Is this funded from business or personal cash flow, and does the timeline match what it is for?',
  },
  general: {
    kind: 'general',
    label: 'savings goal',
    deadlineFlexible: true,
    delayHasFinancialCost: false,
    priorityOverDiscretionary: false,
    targetAsMonthsOfExpenses: null,
    centralQuestion: 'Does the pace reach the date, and if not, is the amount or the date the thing to change?',
  },
  custom: {
    kind: 'custom',
    label: 'savings goal',
    deadlineFlexible: true,
    delayHasFinancialCost: false,
    priorityOverDiscretionary: false,
    targetAsMonthsOfExpenses: null,
    centralQuestion: 'Does the pace reach the date, and if not, is the amount or the date the thing to change?',
  },
};

export function profileFor(kind: string | null | undefined): KindProfile {
  return KIND_PROFILES[(kind ?? 'general') as GoalKind] ?? KIND_PROFILES.general;
}

/**
 * Guess the kind from the name, for goals created before the field was used.
 *
 * Only used when `kind` is the default 'general' — an explicit choice always wins,
 * because a goal someone deliberately called a car fund should not be reclassified
 * because the word "emergency" appears in it.
 */
export function inferKind(name: string, stored: string | null | undefined): GoalKind {
  if (stored && stored !== 'general') return stored as GoalKind;
  const n = name.toLowerCase();
  const rules: [RegExp, GoalKind][] = [
    [/emergency|rainy day|safety net|buffer/, 'emergency_fund'],
    [/debt|credit card|loan payoff|pay off/, 'debt_payoff'],
    [/tuition|school|college|university|course/, 'tuition'],
    [/house|home|deposit|down ?payment|mortgage/, 'house'],
    [/\bcar\b|vehicle|truck|auto/, 'car'],
    [/vacation|holiday|trip|travel|flight/, 'vacation'],
    [/invest|portfolio|retirement|rrsp|tfsa|401k/, 'investment'],
    [/business|startup|company|capital/, 'business_capital'],
  ];
  for (const [pattern, kind] of rules) if (pattern.test(n)) return kind;
  return 'general';
}

export interface KindFinding {
  /** Short, specific, and derived from this goal's own numbers. */
  text: string;
  tone: 'neutral' | 'caution' | 'good';
}

/**
 * Findings that depend on the KIND of goal, not just its arithmetic.
 *
 * Returns nothing when the numbers do not support a statement. An empty list is a
 * correct answer; padding it with generalities is what made every goal read alike.
 */
export function kindFindings(input: {
  kind: GoalKind;
  name: string;
  targetMinor: bigint;
  currentMinor: bigint;
  targetDate: IsoDate | null;
  monthlyOutgoingsMinor: bigint | null;
  requiredMonthlyMinor: bigint | null;
  availableMonthlyMinor: bigint;
  today: IsoDate;
}): KindFinding[] {
  const profile = KIND_PROFILES[input.kind] ?? KIND_PROFILES.general;
  const out: KindFinding[] = [];

  // An emergency fund's target is checkable against the person's own outgoings.
  // No other goal kind has a correct size that the app can compute.
  if (profile.targetAsMonthsOfExpenses && input.monthlyOutgoingsMinor && input.monthlyOutgoingsMinor > 0n) {
    const { min, max } = profile.targetAsMonthsOfExpenses;
    const monthsCovered = Number(input.currentMinor) / Number(input.monthlyOutgoingsMinor);
    const targetMonths = Number(input.targetMinor) / Number(input.monthlyOutgoingsMinor);

    out.push({
      text: `You have about ${monthsCovered.toFixed(1)} month${monthsCovered === 1 ? '' : 's'} of outgoings set aside. The usual range for this is ${min} to ${max}.`,
      tone: monthsCovered >= min ? 'good' : 'neutral',
    });

    if (targetMonths < min) {
      out.push({
        text: `This target is ${targetMonths.toFixed(1)} months of your outgoings, below the ${min}-month floor most guidance uses. Consider raising the target rather than only the contribution.`,
        tone: 'caution',
      });
    } else if (targetMonths > max + 2) {
      out.push({
        text: `This target is ${targetMonths.toFixed(1)} months of outgoings — more than the ${max} months usually suggested. Money beyond that is often doing more elsewhere.`,
        tone: 'neutral',
      });
    }
  }

  // Delay is free for most goals and expensive for exactly one.
  if (profile.delayHasFinancialCost) {
    out.push({
      text: 'Unlike a savings goal, pushing this one back is not free — the balance keeps accruing interest while you wait. Extending the date should be the last option, not the first.',
      tone: 'caution',
    });
  } else if (!profile.deadlineFlexible) {
    out.push({
      text: 'This deadline is set externally, so the date is not a lever. Only the amount and the monthly contribution are.',
      tone: 'neutral',
    });
  }

  // Which goal should yield when several compete for the same money.
  // Discretionary goals all yield to essential ones, but WHY differs enough to be
  // worth saying — a car may not be optional at all, and a holiday always is.
  // Reaching for the same sentence for both is how two goals end up reading alike.
  if (!profile.priorityOverDiscretionary && input.requiredMonthlyMinor && input.availableMonthlyMinor < input.requiredMonthlyMinor) {
    if (input.kind === 'vacation') {
      out.push({
        text: 'A holiday is the one goal here you can move without consequence. If something essential needs the money, this is the one to let slip.',
        tone: 'neutral',
      });
    } else if (input.kind === 'car') {
      out.push({
        text: 'Whether this can wait depends on something Pockit cannot see: if you are replacing a car you rely on, it is not really discretionary. If it is an upgrade, a smaller target reaches the date without cutting anything.',
        tone: 'neutral',
      });
    } else {
      out.push({
        text: `A ${profile.label} is discretionary. Moving its date costs nothing but time, which is usually a better trade than cutting essentials to hold it.`,
        tone: 'neutral',
      });
    }
  }

  if (input.kind === 'investment') {
    out.push({
      text: 'Worth checking before adding to this: an emergency buffer and any high-interest debt normally come first, because a guaranteed interest saving beats an uncertain return.',
      tone: 'neutral',
    });
  }

  return out;
}

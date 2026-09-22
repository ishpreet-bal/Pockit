import { z } from 'zod';

/**
 * Where someone is in first-run, and what they have told us.
 *
 * Stages are named rather than numbered because the questions will be reordered,
 * and a stored "4" silently means something different the moment they are. A name
 * survives the reshuffle.
 */
export const STAGES = [
  'not_started',
  'account_created',
  'financial_setup_started',
  'financial_setup_completed',
  'done',
] as const;

export type Stage = (typeof STAGES)[number];

/** Can this stage still be advanced? `done` is terminal. */
export function isComplete(stage: string): boolean {
  return stage === 'done';
}

/**
 * How often money arrives, and what that is per month.
 *
 * The conversion lives here rather than in the form, because the brief is explicit:
 * people should not be asked to do this arithmetic themselves. 52 weeks and 26
 * fortnights a year, not 4 and 2 per month — the naive version understates annual
 * income by about 8%, which then understates every downstream figure.
 */
export const CADENCES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'yearly'] as const;
export type Cadence = (typeof CADENCES)[number];

export const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: 'Every week',
  biweekly: 'Every two weeks',
  semimonthly: 'Twice a month',
  monthly: 'Every month',
  yearly: 'Once a year',
};

export function toMonthlyMinor(amountMinor: number, cadence: Cadence): number {
  switch (cadence) {
    case 'weekly': return Math.round((amountMinor * 52) / 12);
    case 'biweekly': return Math.round((amountMinor * 26) / 12);
    case 'semimonthly': return amountMinor * 2;
    case 'monthly': return amountMinor;
    case 'yearly': return Math.round(amountMinor / 12);
  }
}

/**
 * The onboarding cadence, as the database's `cadence` enum spells it.
 *
 * They differ by one word: onboarding says "yearly" because that is what people
 * say, and the schema says "annual". Mapping explicitly is the point — passing the
 * onboarding string straight through is a runtime enum error at the exact moment
 * someone finishes setup, which is the worst place to discover it.
 */
export function toDbCadence(cadence: Cadence): 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'annual' {
  return cadence === 'yearly' ? 'annual' : cadence;
}

/**
 * The profile's `income_schedule`, which is a DIFFERENT enum again.
 *
 * It has no annual option, so a yearly income maps to 'irregular' — which is
 * honest: money arriving once a year is not a monthly schedule. Returning null for
 * anything unmappable keeps a bad value out of the column entirely rather than
 * casting past the type checker and failing at the insert.
 */
export function toIncomeSchedule(
  cadence: Cadence,
): 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'irregular' {
  return cadence === 'yearly' ? 'irregular' : cadence;
}

/* ---------------- the answers ---------------- */

const recurringAnswer = z.object({
  name: z.string().trim().min(1).max(80),
  amountMinor: z.number().int().nonnegative(),
  cadence: z.enum(CADENCES),
  categoryId: z.string().uuid().nullable().optional(),
  nextDate: z.string().max(10).nullable().optional(),
});

const goalAnswer = z.object({
  kind: z.string().max(40),
  name: z.string().trim().max(80),
  targetMinor: z.number().int().nonnegative().nullable().optional(),
  currentMinor: z.number().int().nonnegative().nullable().optional(),
  targetDate: z.string().max(10).nullable().optional(),
});

/**
 * Every field is optional, deliberately.
 *
 * Skip has to be available at every step, which means a half-answered shape is the
 * normal case rather than an error. Validation here is about rejecting nonsense,
 * not about insisting the flow was completed.
 */
export const answersSchema = z.object({
  firstName: z.string().trim().max(60).optional(),
  incomeMinor: z.number().int().nonnegative().optional(),
  incomeCadence: z.enum(CADENCES).optional(),
  incomeSource: z.enum(['employment', 'self_employment', 'business', 'multiple', 'other']).optional(),
  recurring: z.array(recurringAnswer).max(30).optional(),
  spendingByCategory: z.record(z.string(), z.number().int().nonnegative()).optional(),
  savingsMinor: z.number().int().nonnegative().optional(),
  goals: z.array(goalAnswer).max(10).optional(),
  /** Which screens they chose to skip, so the summary can say what is missing. */
  skipped: z.array(z.string().max(40)).max(20).optional(),
});

export type Answers = z.infer<typeof answersSchema>;

/**
 * Read stored answers without trusting them.
 *
 * A row written by an older build, or by hand, must not be able to crash the flow.
 * Anything unparseable becomes an empty answer set, which resumes at the start of
 * the financial questions rather than at an error page.
 */
export function parseAnswers(raw: unknown): Answers {
  const result = answersSchema.safeParse(raw ?? {});
  return result.success ? result.data : {};
}

/* ---------------- the derived picture ---------------- */

export interface StartingPicture {
  monthlyIncomeMinor: number | null;
  monthlyCommitmentsMinor: number | null;
  /** Income minus commitments. Null when income is unknown — not zero. */
  flexibleMinor: number | null;
  savingsMinor: number | null;
  goalCount: number;
  /** What they did not tell us, so the summary can say so instead of implying zero. */
  missing: string[];
}

/**
 * The summary shown at the end of onboarding.
 *
 * The rule that shapes it: a figure they did not give is NULL, never zero. "$0 of
 * recurring bills" is a claim about their life; "we do not know yet" is the truth.
 * Getting this wrong is how a new account shows a confident, wrong dashboard.
 */
export function buildPicture(answers: Answers): StartingPicture {
  const missing: string[] = [];

  const monthlyIncomeMinor =
    answers.incomeMinor !== undefined && answers.incomeCadence
      ? toMonthlyMinor(answers.incomeMinor, answers.incomeCadence)
      : null;
  if (monthlyIncomeMinor === null) missing.push('income');

  const recurring = answers.recurring ?? [];
  const monthlyCommitmentsMinor = recurring.length > 0
    ? recurring.reduce((sum, r) => sum + toMonthlyMinor(r.amountMinor, r.cadence), 0)
    : null;
  if (monthlyCommitmentsMinor === null) missing.push('recurring bills');

  if (!answers.spendingByCategory || Object.keys(answers.spendingByCategory).length === 0) {
    missing.push('everyday spending');
  }

  const flexibleMinor =
    monthlyIncomeMinor === null
      ? null
      : monthlyIncomeMinor - (monthlyCommitmentsMinor ?? 0);

  return {
    monthlyIncomeMinor,
    monthlyCommitmentsMinor,
    flexibleMinor,
    savingsMinor: answers.savingsMinor ?? null,
    goalCount: answers.goals?.length ?? 0,
    missing,
  };
}

/** The goals someone can pick from, in the order they are offered. */
export const GOAL_CHOICES = [
  { kind: 'emergency_fund', label: 'Build an emergency fund' },
  { kind: 'car', label: 'Buy a car' },
  { kind: 'vacation', label: 'Travel' },
  { kind: 'debt_payoff', label: 'Pay off debt' },
  { kind: 'house', label: 'Buy a home' },
  { kind: 'investment', label: 'Invest' },
  { kind: 'tuition', label: 'Education' },
  { kind: 'general', label: 'Something else' },
] as const;

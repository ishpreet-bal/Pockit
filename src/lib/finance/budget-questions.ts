import type { BudgetIntent } from './budget-plan';

/**
 * The questions each goal actually needs answered.
 *
 * The wizard used to ask what you were trying to achieve and then ask everyone the
 * same two questions regardless — which made the first screen decorative. Choosing
 * "pay down debt" and choosing "save for a trip" lead to genuinely different plans,
 * so they have to lead to genuinely different questions.
 *
 * This is a pure module on purpose: the branching is the part most likely to be got
 * wrong, and it is far easier to test a function that maps answers to numbers than
 * to test a form.
 */

export type AnswerValue = string;
export type Answers = Record<string, AnswerValue>;

export interface Choice {
  value: string;
  label: string;
  /** Optional one-liner shown under the option. */
  blurb?: string;
}

export interface Question {
  id: string;
  prompt: string;
  /** Plain-language help. Every question earns its place by being answerable. */
  help?: string;
  kind: 'money' | 'choice' | 'months' | 'text';
  choices?: Choice[];
  placeholder?: string;
  /** Which prefilled figure, if any, should seed this answer. */
  prefill?: 'debtTotal' | 'debtMinimum' | 'goalTarget' | 'essentials' | 'suggestedSaving';
  optional?: boolean;
}

const MONTHS_CHOICES: Choice[] = [
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '1 year' },
  { value: '24', label: '2 years' },
  { value: '36', label: '3 years' },
];

const QUESTIONS: Record<BudgetIntent, Question[]> = {
  control_spending: [
    {
      id: 'target_area',
      prompt: 'Where does it feel like the money disappears?',
      help: 'Pockit will set a firmer ceiling here and a looser one everywhere else.',
      kind: 'choice',
      choices: [
        { value: 'food', label: 'Eating out and takeaway' },
        { value: 'shopping', label: 'Shopping' },
        { value: 'subscriptions', label: 'Subscriptions' },
        { value: 'transport', label: 'Transport and fuel' },
        { value: 'unsure', label: 'I genuinely do not know', blurb: 'Then the plan will start even and you can tighten it once there is a month of data.' },
      ],
    },
    {
      id: 'limit_period',
      prompt: 'Would you rather watch a weekly or a monthly number?',
      help: 'Weekly catches drift sooner. Monthly is calmer if your spending is lumpy.',
      kind: 'choice',
      choices: [
        { value: 'weekly', label: 'Weekly', blurb: 'A smaller number, checked more often.' },
        { value: 'monthly', label: 'Monthly', blurb: 'One number for the whole month.' },
      ],
    },
    {
      id: 'essentials',
      prompt: 'Roughly what do groceries and other essentials cost you a month?',
      help: 'A rough figure is fine. This is the floor the plan protects before anything else.',
      kind: 'money',
      prefill: 'essentials',
    },
  ],

  save_more: [
    {
      id: 'save_target',
      prompt: 'How much would you like to put aside each month?',
      help: 'Pick a number you would still hit in a bad month, not a good one.',
      kind: 'money',
      prefill: 'suggestedSaving',
    },
    {
      id: 'save_order',
      prompt: 'Should that come out first, or out of whatever is left?',
      help: 'Taking it first is the single biggest difference between people who save and people who mean to.',
      kind: 'choice',
      choices: [
        { value: 'first', label: 'Take it out first', blurb: 'Treated as a bill. Spending gets what remains.' },
        { value: 'leftovers', label: 'Save what is left', blurb: 'More flexible, and usually less.' },
      ],
    },
    {
      id: 'save_where',
      prompt: 'Where is it going?',
      kind: 'choice',
      choices: [
        { value: 'savings', label: 'A savings account' },
        { value: 'investing', label: 'Investments' },
        { value: 'goal', label: 'A specific goal I have set' },
      ],
    },
  ],

  emergency_fund: [
    {
      id: 'ef_months',
      prompt: 'How many months of expenses do you want covered?',
      help: 'Three months is the usual starting point. Six if your income is irregular.',
      kind: 'choice',
      choices: [
        { value: '3', label: '3 months', blurb: 'A sensible first target.' },
        { value: '6', label: '6 months', blurb: 'Standard advice for variable income.' },
        { value: '12', label: '12 months', blurb: 'Cautious. Takes a long time to build.' },
      ],
    },
    {
      id: 'ef_existing',
      prompt: 'How much do you already have set aside for emergencies?',
      help: 'Only count money you could reach this week without penalty.',
      kind: 'money',
    },
    {
      id: 'ef_deadline',
      prompt: 'By when would you like it fully funded?',
      help: 'Pockit will tell you if the monthly amount that implies is realistic.',
      kind: 'choice',
      choices: MONTHS_CHOICES,
    },
  ],

  pay_down_debt: [
    {
      id: 'debt_total',
      prompt: 'How much do you owe in total?',
      help: 'Cards, loans and lines of credit. Not your mortgage.',
      kind: 'money',
      prefill: 'debtTotal',
    },
    {
      id: 'debt_minimums',
      prompt: 'What do the minimum payments add up to each month?',
      help: 'These are already non-negotiable, so the plan treats them as bills.',
      kind: 'money',
      prefill: 'debtMinimum',
    },
    {
      id: 'debt_strategy',
      prompt: 'Which would keep you going?',
      help: 'Avalanche costs less. Snowball feels better sooner. The difference is usually smaller than the difference between sticking to one and neither.',
      kind: 'choice',
      choices: [
        { value: 'avalanche', label: 'Highest interest first', blurb: 'Cheapest overall.' },
        { value: 'snowball', label: 'Smallest balance first', blurb: 'Clears whole debts sooner, which is motivating.' },
      ],
    },
    {
      id: 'debt_extra',
      prompt: 'How much extra could you put at it in a normal month?',
      help: 'On top of the minimums. Leave it blank if you are not sure yet.',
      kind: 'money',
      optional: true,
    },
  ],

  invest_more: [
    {
      id: 'invest_amount',
      prompt: 'How much would you like to invest each month?',
      kind: 'money',
      prefill: 'suggestedSaving',
    },
    {
      id: 'invest_horizon',
      prompt: 'When would you need this money back?',
      help: 'This is the single most important thing about investing, and it decides everything else.',
      kind: 'choice',
      choices: [
        { value: 'short', label: 'Within 3 years', blurb: 'Short. Pockit will flag that markets can be down over a window this size.' },
        { value: 'medium', label: '3 to 10 years' },
        { value: 'long', label: '10 years or more' },
      ],
    },
    {
      id: 'invest_buffer',
      prompt: 'Do you have an emergency fund already?',
      help: 'Investing before you have a cash buffer usually means selling at the worst time.',
      kind: 'choice',
      choices: [
        { value: 'yes', label: 'Yes, a few months of expenses' },
        { value: 'partly', label: 'Some, not much' },
        { value: 'no', label: 'No' },
      ],
    },
  ],

  big_purchase: [
    {
      id: 'purchase_what',
      prompt: 'What are you saving for?',
      help: 'Naming it makes it markedly more likely to happen.',
      kind: 'text',
      placeholder: 'A trip to Japan',
    },
    {
      id: 'purchase_amount',
      prompt: 'How much do you need?',
      kind: 'money',
      prefill: 'goalTarget',
    },
    {
      id: 'purchase_when',
      prompt: 'When do you want it by?',
      kind: 'choice',
      choices: MONTHS_CHOICES,
    },
    {
      id: 'purchase_saved',
      prompt: 'How much have you saved towards it already?',
      kind: 'money',
      optional: true,
    },
  ],

  balanced: [
    {
      id: 'balanced_shape',
      prompt: 'Start from a standard split, or from how you actually spend?',
      help: 'The standard split is a guideline invented for average rents. Your own history is usually the better starting point.',
      kind: 'choice',
      choices: [
        { value: 'history', label: 'From my own history', blurb: 'Uses what you have actually spent where Pockit has data.' },
        { value: 'standard', label: 'The 50/30/20 guideline', blurb: 'Needs, wants, savings.' },
      ],
    },
    {
      id: 'essentials',
      prompt: 'Roughly what do groceries and other essentials cost you a month?',
      kind: 'money',
      prefill: 'essentials',
    },
  ],

  custom: [],
};

export function questionsFor(intent: BudgetIntent): Question[] {
  return QUESTIONS[intent] ?? [];
}

/** True when every non-optional question has a non-empty answer. */
export function isComplete(intent: BudgetIntent, answers: Answers): boolean {
  return questionsFor(intent).every((q) => q.optional || (answers[q.id] ?? '').trim() !== '');
}

/* ---------------- Turning answers into plan adjustments ---------------- */

export interface PlanAdjustments {
  /** Forced monthly amounts, keyed by plan line, that the answers make non-negotiable. */
  forcedMinor: Record<string, bigint>;
  /** Extra sentences explaining what the answers changed, shown with the plan. */
  notes: string[];
  /** A goal the answers describe, which the wizard can offer to create. */
  suggestedGoal?: { name: string; targetMinor: bigint; months: number };
}

/**
 * Converts answers into concrete changes to the plan.
 *
 * Everything returned here is explained to the person in `notes`. A plan that
 * silently reshapes itself because of an answer three screens back is worse than one
 * that never asked: they cannot tell which of their answers caused what.
 */
export function planAdjustments(
  intent: BudgetIntent,
  answers: Answers,
  parse: (value: string) => bigint,
  monthlyExpensesMinor: bigint,
  /**
   * The caller's currency formatter. Passed in rather than imported so this module
   * stays pure — and so the sentences below cannot hard-code a dollar sign for
   * someone whose workspace is in euros.
   */
  fmtish: (minor: bigint) => string,
): PlanAdjustments {
  const forcedMinor: Record<string, bigint> = {};
  const notes: string[] = [];
  let suggestedGoal: PlanAdjustments['suggestedGoal'];

  switch (intent) {
    case 'save_more': {
      const target = parse(answers.save_target ?? '');
      if (target > 0n) {
        forcedMinor.savings = target;
        notes.push(
          answers.save_order === 'first'
            ? `Your ${fmtish(target)} of saving is set aside before spending, so the flexible amount below is what is genuinely left over.`
            : `Saving is set to ${fmtish(target)}, taken from what remains after spending.`,
        );
      }
      if (answers.save_where === 'investing') {
        notes.push('Because this is going into investments, treat the amount as money you will not touch for years.');
      }
      break;
    }

    case 'emergency_fund': {
      const months = Number(answers.ef_months ?? '3');
      const existing = parse(answers.ef_existing ?? '');
      const deadline = Math.max(1, Number(answers.ef_deadline ?? '12'));
      const target = monthlyExpensesMinor * BigInt(Math.max(1, months));
      const remaining = target > existing ? target - existing : 0n;
      const perMonth = remaining / BigInt(deadline);

      if (remaining > 0n) {
        forcedMinor.savings = perMonth;
        notes.push(
          `${months} months of your expenses is ${fmtish(target)}. You have ${fmtish(existing)}, ` +
          `so ${fmtish(remaining)} to go — ${fmtish(perMonth)} a month to be done in ${deadline} months.`,
        );
        suggestedGoal = { name: 'Emergency fund', targetMinor: target, months: deadline };
      } else {
        notes.push(`You already have ${months} months of expenses set aside. This plan keeps it topped up rather than building it.`);
      }
      break;
    }

    case 'pay_down_debt': {
      const minimums = parse(answers.debt_minimums ?? '');
      const extra = parse(answers.debt_extra ?? '');
      const total = parse(answers.debt_total ?? '');
      if (minimums > 0n) {
        forcedMinor.debt = minimums + extra;
        notes.push(
          extra > 0n
            ? `${fmtish(minimums)} of minimums plus ${fmtish(extra)} extra is committed to debt before anything else.`
            : `${fmtish(minimums)} of minimum payments is committed before anything else.`,
        );
      }
      if (total > 0n && minimums + extra > 0n) {
        const months = Number(total / (minimums + extra));
        if (Number.isFinite(months) && months > 0) {
          notes.push(
            `At ${fmtish(minimums + extra)} a month that is roughly ${months} month${months === 1 ? '' : 's'} ` +
            'before interest — interest will make it longer, and the Debts page models that properly.',
          );
        }
      }
      notes.push(
        answers.debt_strategy === 'snowball'
          ? 'Smallest balance first: you will clear whole debts sooner, which is the point.'
          : 'Highest interest first: this costs the least overall.',
      );
      break;
    }

    case 'invest_more': {
      const amount = parse(answers.invest_amount ?? '');
      if (amount > 0n) forcedMinor.investing = amount;
      if (answers.invest_buffer === 'no') {
        notes.push(
          'You said you have no emergency fund. Investing first tends to mean selling at the worst possible moment, ' +
          'so this plan puts the first slice into cash savings until you have a buffer.',
        );
        forcedMinor.savings = amount;
        delete forcedMinor.investing;
      } else if (answers.invest_horizon === 'short') {
        notes.push(
          'Within three years is a short horizon for investing. Markets are frequently down over a window that size, ' +
          'so treat this money as at risk rather than as savings.',
        );
      }
      break;
    }

    case 'big_purchase': {
      const amount = parse(answers.purchase_amount ?? '');
      const saved = parse(answers.purchase_saved ?? '');
      const months = Math.max(1, Number(answers.purchase_when ?? '12'));
      const remaining = amount > saved ? amount - saved : 0n;
      if (remaining > 0n) {
        const perMonth = remaining / BigInt(months);
        forcedMinor.goals = perMonth;
        const what = (answers.purchase_what ?? '').trim() || 'this';
        notes.push(`${what}: ${fmtish(remaining)} left over ${months} months is ${fmtish(perMonth)} a month.`);
        suggestedGoal = { name: what, targetMinor: amount, months };
      }
      break;
    }

    case 'control_spending': {
      if (answers.limit_period === 'weekly') {
        notes.push('Your flexible spending is shown as a weekly figure on the budget page, since that is what you said you would watch.');
      }
      const area = answers.target_area;
      if (area && area !== 'unsure') {
        notes.push(`${AREA_LABELS[area] ?? area} gets the firmer ceiling; everything else is left looser.`);
      }
      break;
    }

    case 'balanced': {
      notes.push(
        answers.balanced_shape === 'standard'
          ? 'Using the 50/30/20 guideline. It assumes around half your income covers all essentials including rent, which may not match your situation.'
          : 'Shaped from your own spending where Pockit has data, and from the guideline where it does not.',
      );
      break;
    }

    case 'custom':
      break;
  }

  return { forcedMinor, notes, suggestedGoal };
}

const AREA_LABELS: Record<string, string> = {
  food: 'Eating out and takeaway',
  shopping: 'Shopping',
  subscriptions: 'Subscriptions',
  transport: 'Transport and fuel',
};


/* ---------------- "I'm not sure what I'm trying to do" ---------------- */

export interface TriageQuestion {
  id: string;
  prompt: string;
  choices: Choice[];
}

/**
 * Three questions that pick a goal for someone who does not have one.
 *
 * Deliberately deterministic rather than a chat with a model. Two reasons: it works
 * with no API key configured, which is the default state of this app; and the answer
 * to "which budgeting approach fits me" genuinely is a short decision tree — debt
 * first, then a cash buffer, then everything else. Dressing that up as a
 * conversation would be slower and no more accurate.
 *
 * Where an AI provider IS configured, the assistant remains available for the
 * open-ended questions this cannot answer.
 */
export const TRIAGE: TriageQuestion[] = [
  {
    id: 'debt',
    prompt: 'Do you owe money on cards or loans, not counting a mortgage?',
    choices: [
      { value: 'lots', label: 'Yes, and it worries me' },
      { value: 'some', label: 'Some, but it is manageable' },
      { value: 'none', label: 'No' },
    ],
  },
  {
    id: 'buffer',
    prompt: 'If your income stopped tomorrow, how long could you cover your bills?',
    choices: [
      { value: 'none', label: 'Under a month' },
      { value: 'some', label: 'One to three months' },
      { value: 'plenty', label: 'More than three months' },
    ],
  },
  {
    id: 'feeling',
    prompt: 'Which is closest to how you feel about money right now?',
    choices: [
      { value: 'blind', label: 'I have no idea where it goes' },
      { value: 'stuck', label: 'I know, but nothing is left over' },
      { value: 'ready', label: 'It is fine — I want it doing more' },
    ],
  },
];

export interface Recommendation {
  intent: BudgetIntent;
  /** Why this one, in the person's own terms. */
  because: string;
  /** What they might reasonably pick instead. */
  alternative?: { intent: BudgetIntent; label: string };
}

/**
 * The order here is not arbitrary. Expensive debt outruns any return you could earn,
 * so it comes first; a cash buffer comes next because without one, any setback
 * becomes new debt; and only then is there a point discussing growth.
 */
export function recommendIntent(answers: Answers): Recommendation {
  const debt = answers.debt ?? 'none';
  const buffer = answers.buffer ?? 'some';
  const feeling = answers.feeling ?? 'blind';

  if (debt === 'lots') {
    return {
      intent: 'pay_down_debt',
      because:
        'You have debt that is weighing on you. Card interest almost always costs more than savings or ' +
        'investments earn, so clearing it is the highest-return thing available to you right now.',
      alternative: { intent: 'emergency_fund', label: 'Build a small buffer first' },
    };
  }

  if (buffer === 'none') {
    return {
      intent: 'emergency_fund',
      because:
        'You could cover under a month without income. A buffer is what stops the next unexpected bill ' +
        'turning into debt, so it comes before anything else.',
      alternative: { intent: 'control_spending', label: 'See where it goes first' },
    };
  }

  if (feeling === 'blind') {
    return {
      intent: 'control_spending',
      because:
        'You are not short of money so much as short of a picture of it. A month of seeing where it ' +
        'actually goes will tell you more than any plan set today.',
      alternative: { intent: 'balanced', label: 'Just give me a sensible split' },
    };
  }

  if (feeling === 'stuck') {
    return {
      intent: 'control_spending',
      because:
        'Nothing being left over usually means the gap is in the flexible spending rather than the bills. ' +
        'Setting a ceiling there is the fastest way to find it.',
      alternative: { intent: 'save_more', label: 'Force saving first instead' },
    };
  }

  if (debt === 'some') {
    return {
      intent: 'pay_down_debt',
      because:
        'Things are stable and you have some debt left. Clearing it now is a guaranteed return at ' +
        'whatever rate you are paying, which is hard to beat elsewhere.',
      alternative: { intent: 'invest_more', label: 'Invest instead' },
    };
  }

  return {
    intent: buffer === 'plenty' ? 'invest_more' : 'save_more',
    because:
      buffer === 'plenty'
        ? 'No debt and a real buffer. That is the point at which putting money to work makes sense.'
        : 'No debt and a reasonable buffer. Building that further is the simplest next step.',
    alternative: { intent: 'big_purchase', label: 'Save for something specific' },
  };
}

/**
 * Working out what kind of investor someone is, and what that implies.
 *
 * Scope, stated plainly and enforced by the code below:
 *
 *  - This suggests BROAD, DIVERSIFIED asset mixes — how much in stocks versus bonds
 *    versus cash — and never individual securities to buy.
 *  - It will not produce a suggestion for a horizon under three years, because the
 *    honest answer there is "do not invest this", and it says so.
 *  - It has no opinion on timing, and explicitly refuses to support day trading.
 *
 * Everything is a pure function of the answers, so the reasoning can be tested and
 * shown rather than asserted.
 */

export type Horizon = 'under1' | 'one_to_three' | 'three_to_ten' | 'over_ten';
export type Experience = 'none' | 'some' | 'confident';
export type Reaction = 'sell' | 'wait' | 'buy';

export interface InvestorAnswers {
  experience: Experience;
  horizon: Horizon;
  reaction: Reaction;
  /** Whether they hold an emergency fund. Dominates everything else. */
  hasBuffer: boolean;
  /** Whether they carry high-interest debt. Also dominates everything else. */
  hasHighInterestDebt: boolean;
}

export type RiskLevel = 'not_yet' | 'cash' | 'conservative' | 'balanced' | 'growth';

export interface Allocation {
  stocksPct: number;
  bondsPct: number;
  cashPct: number;
}

export interface InvestorProfile {
  level: RiskLevel;
  headline: string;
  /** Why this, in their terms. Never omitted. */
  reasoning: string[];
  /** Null when the honest answer is "do not invest this money yet". */
  allocation: Allocation | null;
  /** What to do before investing, when something should come first. */
  blockers: string[];
}

export const HORIZON_YEARS: Record<Horizon, string> = {
  under1: 'less than a year',
  one_to_three: 'one to three years',
  three_to_ten: 'three to ten years',
  over_ten: 'more than ten years',
};

/**
 * The order of checks is the advice.
 *
 * High-interest debt is a guaranteed negative return that no portfolio reliably
 * beats. A cash buffer is what stops the next surprise forcing a sale at the worst
 * moment. A short horizon means a normal market fall has no time to recover. Each
 * of these outranks any question about risk appetite, so they are checked first and
 * they stop the process rather than nudging a percentage.
 */
export function buildInvestorProfile(a: InvestorAnswers): InvestorProfile {
  const reasoning: string[] = [];
  const blockers: string[] = [];

  if (a.hasHighInterestDebt) {
    blockers.push('Clear high-interest debt first.');
    reasoning.push(
      'Paying off a card at 20% is a guaranteed 20% return. No sensible portfolio promises that, ' +
      'so clearing it beats investing while the balance is there.',
    );
  }

  if (!a.hasBuffer) {
    blockers.push('Build a cash buffer of a few months of expenses.');
    reasoning.push(
      'Without a buffer, the next unexpected bill has to come out of investments — which means selling ' +
      'whenever it happens to arrive, including when prices are down.',
    );
  }

  if (a.horizon === 'under1' || a.horizon === 'one_to_three') {
    blockers.push('Keep money you need within three years in cash or a savings account.');
    reasoning.push(
      `You said you would need this money in ${HORIZON_YEARS[a.horizon]}. Markets are frequently down over ` +
      'a window that short, and there is no time to wait out a fall. This is a savings question, not an ' +
      'investing one.',
    );
  }

  if (blockers.length > 0) {
    return {
      level: a.horizon === 'under1' || a.horizon === 'one_to_three' ? 'cash' : 'not_yet',
      headline:
        a.horizon === 'under1' || a.horizon === 'one_to_three'
          ? 'Keep this money in cash'
          : 'Not yet — there is something better to do first',
      reasoning,
      allocation: null,
      blockers,
    };
  }

  // Past the blockers, horizon sets the ceiling and temperament pulls it back.
  let stocks = a.horizon === 'over_ten' ? 90 : 70;
  reasoning.push(
    a.horizon === 'over_ten'
      ? 'A horizon beyond ten years is long enough that the usual falls have historically had time to recover.'
      : 'Three to ten years is long enough to invest, but not long enough to ignore a bad couple of years.',
  );

  if (a.reaction === 'sell') {
    stocks -= 25;
    reasoning.push(
      'You said a 20% fall would make you sell. That matters more than any formula: a portfolio you abandon ' +
      'at the bottom performs far worse than a calmer one you keep. This mix is deliberately gentler.',
    );
  } else if (a.reaction === 'buy') {
    reasoning.push('You said a fall would tempt you to buy more, so a higher share of stocks is consistent with how you would actually behave.');
  } else {
    reasoning.push('You said you would sit tight through a fall, which is what makes a stock-heavy mix workable.');
  }

  if (a.experience === 'none') {
    stocks -= 10;
    reasoning.push(
      'Starting out, a slightly gentler mix means your first experience of a market fall is a smaller one.',
    );
  }

  stocks = Math.max(30, Math.min(90, stocks));
  const bonds = Math.min(100 - stocks, Math.round((100 - stocks) * 0.8));
  const cash = 100 - stocks - bonds;

  const level: RiskLevel = stocks >= 80 ? 'growth' : stocks >= 60 ? 'balanced' : 'conservative';

  return {
    level,
    headline:
      level === 'growth' ? 'A growth mix suits your answers'
      : level === 'balanced' ? 'A balanced mix suits your answers'
      : 'A conservative mix suits your answers',
    reasoning,
    allocation: { stocksPct: stocks, bondsPct: bonds, cashPct: cash },
    blockers: [],
  };
}

/**
 * The disclaimer, in one place so it cannot drift between screens.
 *
 * Written to be read rather than scrolled past: what this is, what it is not, and
 * the one thing it will never do.
 */
export const INVESTING_DISCLAIMER = [
  'Pockit is not a financial adviser, and nothing here is financial advice.',
  'Suggestions are broad asset mixes generated from your own answers and widely published general principles — not a recommendation to buy any particular security.',
  'Past performance does not predict future returns. You can lose money, including money you have already put in.',
  'Pockit does not predict short-term price movements and is not built for day trading. Any tool claiming to do that accurately, including this one, should be distrusted.',
  'Prices shown may be delayed, and are illustrative sample data unless the page says otherwise.',
] as const;

export interface InvestorQuestion {
  id: 'experience' | 'horizon' | 'reaction' | 'hasBuffer' | 'hasHighInterestDebt';
  prompt: string;
  help?: string;
  choices: readonly { value: string; label: string; blurb?: string }[];
}

/**
 * The questions, kept beside the logic that consumes them.
 *
 * Typed explicitly rather than left to `as const`: an inferred tuple makes `help`
 * and `blurb` absent from the members that omit them, so consumers cannot read
 * either without narrowing every element first.
 */
export const INVESTOR_QUESTIONS: readonly InvestorQuestion[] = [
  {
    id: 'experience',
    prompt: 'How familiar are you with investing?',
    choices: [
      { value: 'none', label: 'Not at all', blurb: 'Never bought an investment.' },
      { value: 'some', label: 'A little', blurb: 'A pension, or a bit in an index fund.' },
      { value: 'confident', label: 'Comfortable', blurb: 'I know what I hold and why.' },
    ],
  },
  {
    id: 'horizon',
    prompt: 'When would you need this money back?',
    help: 'The single most important answer here. It decides everything else.',
    choices: [
      { value: 'under1', label: 'Within a year' },
      { value: 'one_to_three', label: 'One to three years' },
      { value: 'three_to_ten', label: 'Three to ten years' },
      { value: 'over_ten', label: 'More than ten years' },
    ],
  },
  {
    id: 'reaction',
    prompt: 'Your investments fall 20% in a month. What do you actually do?',
    help: 'Answer with what you would really do, not what sounds disciplined.',
    choices: [
      { value: 'sell', label: 'Sell, to stop it getting worse' },
      { value: 'wait', label: 'Leave it alone and wait' },
      { value: 'buy', label: 'Put more in while it is cheaper' },
    ],
  },
  {
    id: 'hasBuffer',
    prompt: 'Do you have a few months of expenses saved in cash?',
    choices: [
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'Not yet' },
    ],
  },
  {
    id: 'hasHighInterestDebt',
    prompt: 'Do you owe anything on a credit card or a high-interest loan?',
    choices: [
      { value: 'false', label: 'No' },
      { value: 'true', label: 'Yes' },
    ],
  },
];

import { describe, it, expect } from 'vitest';
import {
  questionsFor, isComplete, planAdjustments, recommendIntent, TRIAGE,
} from './budget-questions';
import { BUDGET_INTENTS, type BudgetIntent } from './budget-plan';

/** Stand-in for the caller's parser: "1,200" -> 120000 minor units. */
const parse = (v: string): bigint => {
  const n = Number((v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? BigInt(Math.round(n * 100)) : 0n;
};
const fmt = (minor: bigint) => `$${(minor / 100n).toString()}`;

describe('question branching', () => {
  it('asks different questions for different goals', () => {
    const debt = questionsFor('pay_down_debt').map((q) => q.id);
    const purchase = questionsFor('big_purchase').map((q) => q.id);
    expect(debt).not.toEqual(purchase);
    // The complaint that started this: every goal led to the same two questions.
    expect(debt.some((id) => purchase.includes(id))).toBe(false);
  });

  it('covers every intent, so no choice can dead-end', () => {
    for (const intent of BUDGET_INTENTS) {
      expect(() => questionsFor(intent.id)).not.toThrow();
    }
    // 'custom' is the one intent that legitimately asks nothing.
    expect(questionsFor('custom')).toHaveLength(0);
  });

  it('treats optional questions as answered', () => {
    const answers = {
      debt_total: '5000', debt_minimums: '200', debt_strategy: 'avalanche',
      // debt_extra omitted on purpose — it is optional
    };
    expect(isComplete('pay_down_debt', answers)).toBe(true);
  });

  it('blocks on a missing required answer', () => {
    expect(isComplete('pay_down_debt', { debt_total: '5000' })).toBe(false);
  });
});

describe('answers change the plan', () => {
  it('commits minimums plus extra to debt', () => {
    const a = planAdjustments('pay_down_debt', {
      debt_total: '6000', debt_minimums: '200', debt_extra: '100', debt_strategy: 'avalanche',
    }, parse, 300000n, fmt);
    expect(a.forcedMinor.debt).toBe(30000n);
    expect(a.notes.join(' ')).toContain('committed to debt');
  });

  it('computes an emergency fund from months of real expenses', () => {
    // 3 months of $3,000 expenses = $9,000; $3,000 saved; 6 months to go.
    const a = planAdjustments('emergency_fund', {
      ef_months: '3', ef_existing: '3000', ef_deadline: '6',
    }, parse, 300000n, fmt);
    expect(a.forcedMinor.savings).toBe(100000n); // ($9,000 - $3,000) / 6 = $1,000
    expect(a.suggestedGoal?.targetMinor).toBe(900000n);
    expect(a.suggestedGoal?.months).toBe(6);
  });

  it('does not demand more saving when the fund is already full', () => {
    const a = planAdjustments('emergency_fund', {
      ef_months: '3', ef_existing: '20000', ef_deadline: '6',
    }, parse, 300000n, fmt);
    expect(a.forcedMinor.savings).toBeUndefined();
    expect(a.notes.join(' ')).toContain('already have');
  });

  it('redirects investing into cash when there is no buffer', () => {
    // Investing before holding a buffer means selling at the worst moment; the
    // plan must actually move the money, not merely warn about it.
    const a = planAdjustments('invest_more', {
      invest_amount: '500', invest_horizon: 'long', invest_buffer: 'no',
    }, parse, 300000n, fmt);
    expect(a.forcedMinor.investing).toBeUndefined();
    expect(a.forcedMinor.savings).toBe(50000n);
    expect(a.notes.join(' ')).toContain('emergency fund');
  });

  it('leaves investing alone when a buffer exists', () => {
    const a = planAdjustments('invest_more', {
      invest_amount: '500', invest_horizon: 'long', invest_buffer: 'yes',
    }, parse, 300000n, fmt);
    expect(a.forcedMinor.investing).toBe(50000n);
  });

  it('turns a purchase into a monthly amount and a goal', () => {
    const a = planAdjustments('big_purchase', {
      purchase_what: 'Japan trip', purchase_amount: '6000', purchase_when: '12', purchase_saved: '1200',
    }, parse, 300000n, fmt);
    expect(a.forcedMinor.goals).toBe(40000n); // ($6,000 - $1,200) / 12 = $400
    expect(a.suggestedGoal?.name).toBe('Japan trip');
  });

  it('uses the caller currency formatter rather than assuming dollars', () => {
    const euros = (minor: bigint) => `€${(minor / 100n).toString()}`;
    const a = planAdjustments('save_more', {
      save_target: '400', save_order: 'first', save_where: 'savings',
    }, parse, 300000n, euros);
    expect(a.notes.join(' ')).toContain('€400');
    expect(a.notes.join(' ')).not.toContain('$');
  });

  it('explains every adjustment it makes', () => {
    const cases: [BudgetIntent, Record<string, string>][] = [
      ['save_more', { save_target: '300', save_order: 'first', save_where: 'savings' }],
      ['emergency_fund', { ef_months: '3', ef_existing: '0', ef_deadline: '12' }],
      ['pay_down_debt', { debt_total: '1000', debt_minimums: '50', debt_strategy: 'snowball' }],
      ['big_purchase', { purchase_what: 'Car', purchase_amount: '9000', purchase_when: '24' }],
    ];
    for (const [intent, answers] of cases) {
      const a = planAdjustments(intent, answers, parse, 300000n, fmt);
      if (Object.keys(a.forcedMinor).length > 0) {
        expect(a.notes.length, `${intent} changed the plan without saying so`).toBeGreaterThan(0);
      }
    }
  });
});

describe('recommending a goal', () => {
  it('puts worrying debt ahead of everything else', () => {
    const r = recommendIntent({ debt: 'lots', buffer: 'plenty', feeling: 'ready' });
    expect(r.intent).toBe('pay_down_debt');
  });

  it('puts a buffer ahead of growth', () => {
    const r = recommendIntent({ debt: 'none', buffer: 'none', feeling: 'ready' });
    expect(r.intent).toBe('emergency_fund');
  });

  it('suggests investing only with no debt and a real buffer', () => {
    const r = recommendIntent({ debt: 'none', buffer: 'plenty', feeling: 'ready' });
    expect(r.intent).toBe('invest_more');
  });

  it('always gives a reason and a valid intent', () => {
    const valid = new Set(BUDGET_INTENTS.map((i) => i.id));
    for (const debt of ['lots', 'some', 'none']) {
      for (const buffer of ['none', 'some', 'plenty']) {
        for (const feeling of ['blind', 'stuck', 'ready']) {
          const r = recommendIntent({ debt, buffer, feeling });
          expect(valid.has(r.intent)).toBe(true);
          expect(r.because.length).toBeGreaterThan(20);
        }
      }
    }
  });

  it('answers every triage question it asks', () => {
    // A question with no effect on the outcome is a question not worth asking.
    const ids = TRIAGE.map((q) => q.id);
    expect(ids).toEqual(['debt', 'buffer', 'feeling']);
    const base = { debt: 'none', buffer: 'some', feeling: 'ready' };
    for (const id of ids) {
      const changed = TRIAGE.find((q) => q.id === id)!.choices
        .map((c) => recommendIntent({ ...base, [id]: c.value }).intent);
      expect(new Set(changed).size, `${id} never changes the recommendation`).toBeGreaterThan(1);
    }
  });
});

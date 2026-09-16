import { describe, it, expect } from 'vitest';
import { buildPlan, type PlanInput } from './budget-plan';
import type { LedgerCategory } from './types';

const categories: LedgerCategory[] = [
  { id: 'groceries', parentId: null, name: 'Food', slug: 'food', kind: 'expense', classification: 'variable', necessity: 'essential', color: null, icon: null },
  { id: 'fun', parentId: null, name: 'Entertainment', slug: 'entertainment', kind: 'expense', classification: 'variable', necessity: 'discretionary', color: null, icon: null },
];

function input(p: Partial<PlanInput>): PlanInput {
  return {
    monthlyIncomeMinor: 500_000n,
    fixedCostsMinor: 180_000n,
    intent: 'balanced',
    historicalByCategory: new Map(),
    categories,
    currency: 'CAD',
    ...p,
  };
}

describe('guided budget plan', () => {
  it('allocates what is left after committed bills, not the whole income', () => {
    const plan = buildPlan(input({}));
    expect(plan.availableMinor).toBe(320_000n);
    const total = plan.lines.reduce((s, l) => s + l.amountMinor, 0n);
    expect(total).toBeLessThanOrEqual(plan.availableMinor);
    expect(plan.feasible).toBe(true);
  });

  it('explains every line rather than just producing numbers', () => {
    const plan = buildPlan(input({}));
    expect(plan.lines.length).toBeGreaterThan(1);
    for (const line of plan.lines) {
      expect(line.basis.length).toBeGreaterThan(10);
    }
    expect(plan.summary).toMatch(/\$/);
    expect(plan.summary).toMatch(/committed to bills/i);
  });

  /**
   * The specific complaint: a generic 50/30/20 rule is useless to someone whose rent
   * already eats 45% of their income. The plan must adapt AND say so.
   */
  it('adapts when fixed costs are out of proportion, and says why', () => {
    const plan = buildPlan(input({ monthlyIncomeMinor: 400_000n, fixedCostsMinor: 200_000n }));
    expect(plan.availableMinor).toBe(200_000n);
    expect(plan.notes.join(' ')).toMatch(/50%|does not apply|fixed bills are/i);
    // It still produces a usable plan rather than refusing.
    expect(plan.feasible).toBe(true);
    expect(plan.lines.length).toBeGreaterThan(0);
  });

  it('refuses to pretend when bills already exceed income', () => {
    const plan = buildPlan(input({ monthlyIncomeMinor: 300_000n, fixedCostsMinor: 320_000n }));
    expect(plan.feasible).toBe(false);
    expect(plan.summary).toMatch(/exceed/i);
    // It does not hand back a fake allocation.
    expect(plan.lines).toHaveLength(0);
  });

  it('uses real spending history for essentials when it exists', () => {
    const withHistory = buildPlan(input({
      historicalByCategory: new Map([['groceries', 90_000n]]),
    }));
    const essentials = withHistory.lines.find((l) => l.bucket === 'essentials')!;
    expect(essentials.amountMinor).toBe(90_000n);
    expect(essentials.basis).toMatch(/your average/i);
  });

  it('says plainly when it is guessing instead of using history', () => {
    const noHistory = buildPlan(input({}));
    const essentials = noHistory.lines.find((l) => l.bucket === 'essentials')!;
    expect(essentials.basis).toMatch(/starting estimate/i);
  });

  it('shifts the split according to what the user said they wanted', () => {
    const saving = buildPlan(input({ intent: 'save_more' }));
    const spending = buildPlan(input({ intent: 'control_spending' }));
    const debt = buildPlan(input({ intent: 'pay_down_debt' }));

    const savingsOf = (p: ReturnType<typeof buildPlan>) =>
      p.lines.find((l) => l.bucket === 'savings')?.amountMinor ?? 0n;

    expect(savingsOf(saving)).toBeGreaterThan(savingsOf(spending));
    expect(debt.lines.some((l) => l.bucket === 'debt')).toBe(true);
    expect(buildPlan(input({ intent: 'invest_more' })).lines.some((l) => l.bucket === 'investing')).toBe(true);
  });

  it('honours goal commitments the user already made', () => {
    const plan = buildPlan(input({ intent: 'big_purchase', goalCommitmentMinor: 60_000n }));
    const goals = plan.lines.find((l) => l.bucket === 'goals');
    expect(goals).toBeTruthy();
    expect(goals!.amountMinor).toBeGreaterThanOrEqual(60_000n);
  });

  it('flags when recent essential spending exceeds what is available', () => {
    const plan = buildPlan(input({
      fixedCostsMinor: 300_000n,
      historicalByCategory: new Map([['groceries', 400_000n]]),
    }));
    expect(plan.notes.join(' ')).toMatch(/more than the/i);
  });

  it('rounds suggestions to readable amounts', () => {
    const plan = buildPlan(input({ monthlyIncomeMinor: 512_347n, fixedCostsMinor: 183_211n }));
    for (const line of plan.lines) {
      if (line.bucket === 'essentials' || line.bucket === 'flexible') continue;
      expect(line.amountMinor % 500n).toBe(0n);
    }
  });
});

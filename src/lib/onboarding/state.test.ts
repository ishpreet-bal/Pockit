import { describe, it, expect } from 'vitest';
import { toMonthlyMinor, buildPicture, parseAnswers, isComplete } from './state';

describe('income cadence conversion', () => {
  it('uses 52 weeks and 26 fortnights, not 4 and 2 a month', () => {
    // $1,000 weekly is $4,333.33 a month, not $4,000. The naive version understates
    // annual income by about 8%, and every downstream figure inherits that.
    expect(toMonthlyMinor(100_000, 'weekly')).toBe(433_333);
    expect(toMonthlyMinor(100_000, 'biweekly')).toBe(216_667);
  });

  it('handles the cadences that ARE simple', () => {
    expect(toMonthlyMinor(100_000, 'semimonthly')).toBe(200_000);
    expect(toMonthlyMinor(100_000, 'monthly')).toBe(100_000);
    expect(toMonthlyMinor(1_200_000, 'yearly')).toBe(100_000);
  });
});

describe('the starting picture', () => {
  it('reports what it does not know as unknown, never as zero', () => {
    // "$0 of recurring bills" is a claim about someone's life. "We do not know yet"
    // is the truth, and the difference is a dashboard that lies on day one.
    const picture = buildPicture({});
    expect(picture.monthlyIncomeMinor).toBeNull();
    expect(picture.monthlyCommitmentsMinor).toBeNull();
    expect(picture.flexibleMinor).toBeNull();
    expect(picture.missing).toContain('income');
    expect(picture.missing).toContain('recurring bills');
  });

  it('computes flexible money from what was given', () => {
    const picture = buildPicture({
      incomeMinor: 500_000, incomeCadence: 'biweekly',
      recurring: [
        { name: 'Rent', amountMinor: 180_000, cadence: 'monthly' },
        { name: 'Phone', amountMinor: 6_000, cadence: 'monthly' },
      ],
    });
    // $5,000 every two weeks = $10,833.33/month, minus $1,860 of bills.
    expect(picture.monthlyIncomeMinor).toBe(1_083_333);
    expect(picture.monthlyCommitmentsMinor).toBe(186_000);
    expect(picture.flexibleMinor).toBe(897_333);
  });

  it('still gives a flexible figure when only income is known', () => {
    // Bills unknown is not bills of zero, but the flexible figure is still the best
    // estimate available — and `missing` is what says it is provisional.
    const picture = buildPicture({ incomeMinor: 300_000, incomeCadence: 'monthly' });
    expect(picture.flexibleMinor).toBe(300_000);
    expect(picture.missing).toContain('recurring bills');
  });

  it('counts goals without inventing their values', () => {
    const picture = buildPicture({ goals: [{ kind: 'car', name: 'Car' }, { kind: 'vacation', name: 'Trip' }] });
    expect(picture.goalCount).toBe(2);
  });
});

describe('stored answers are never trusted', () => {
  it('survives a row written by an older build', () => {
    expect(parseAnswers({ somethingRemoved: true, incomeMinor: 'not a number' })).toEqual({});
  });

  it('survives null and nonsense', () => {
    expect(parseAnswers(null)).toEqual({});
    expect(parseAnswers('nope')).toEqual({});
  });

  it('keeps what is valid', () => {
    const parsed = parseAnswers({ firstName: 'Ish', incomeMinor: 500_000, incomeCadence: 'monthly' });
    expect(parsed.firstName).toBe('Ish');
    expect(parsed.incomeMinor).toBe(500_000);
  });
});

describe('stages', () => {
  it('knows which stage means finished', () => {
    expect(isComplete('done')).toBe(true);
    expect(isComplete('account_created')).toBe(false);
    expect(isComplete('not_started')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { inferKind, kindFindings, profileFor } from './goal-kinds';

describe('goal kinds', () => {
  it('infers a kind from the name when none was chosen', () => {
    expect(inferKind('Emergency fund', 'general')).toBe('emergency_fund');
    expect(inferKind('New car', 'general')).toBe('car');
    expect(inferKind('Trip to Japan', 'general')).toBe('vacation');
    expect(inferKind('House deposit', null)).toBe('house');
    expect(inferKind('Pay off credit card', 'general')).toBe('debt_payoff');
  });

  it('never overrides a kind the user actually chose', () => {
    // "Emergency" in the name must not reclassify a goal deliberately set to car.
    expect(inferKind('Emergency car replacement', 'car')).toBe('car');
  });

  it('falls back to general for anything unrecognised', () => {
    expect(inferKind('Thing', 'general')).toBe('general');
    expect(profileFor('nonsense').kind).toBe('general');
  });
});

describe('kind findings differ by kind, not by wording', () => {
  const base = {
    name: 'Goal',
    targetMinor: 1_000_000n,
    currentMinor: 320_000n,
    targetDate: '2027-06-01',
    monthlyOutgoingsMinor: 200_000n,
    requiredMonthlyMinor: 90_000n,
    availableMonthlyMinor: 40_000n,
    today: '2026-09-22',
  };

  it('measures an emergency fund against the person\'s own outgoings', () => {
    const found = kindFindings({ ...base, kind: 'emergency_fund' });
    // $3,200 saved against $2,000/month of outgoings is 1.6 months.
    expect(found.some((f) => /1\.6 months of outgoings set aside/.test(f.text))).toBe(true);
  });

  it('says a too-small emergency target is the thing to change', () => {
    // $10,000 target against $2,000/month outgoings is 5 months — inside the range.
    expect(kindFindings({ ...base, kind: 'emergency_fund' }).some((f) => /below the 3-month floor/.test(f.text))).toBe(false);
    // $4,000 target is 2 months, which is below it.
    const small = kindFindings({ ...base, kind: 'emergency_fund', targetMinor: 400_000n });
    expect(small.some((f) => /below the 3-month floor/.test(f.text))).toBe(true);
  });

  it('warns that delay costs money for debt, and not for savings', () => {
    const debt = kindFindings({ ...base, kind: 'debt_payoff' });
    expect(debt.some((f) => /accruing interest/.test(f.text))).toBe(true);
    const vacation = kindFindings({ ...base, kind: 'vacation' });
    expect(vacation.some((f) => /accruing interest/.test(f.text))).toBe(false);
  });

  it('treats a fixed deadline as not a lever', () => {
    expect(kindFindings({ ...base, kind: 'tuition' }).some((f) => /set externally/.test(f.text))).toBe(true);
    expect(kindFindings({ ...base, kind: 'house' }).some((f) => /set externally/.test(f.text))).toBe(false);
  });

  it('produces materially different findings for different kinds', () => {
    // The point of the whole module: the same numbers must not yield the same text.
    const kinds = ['emergency_fund', 'debt_payoff', 'vacation', 'tuition', 'investment'] as const;
    const texts = kinds.map((kind) => kindFindings({ ...base, kind }).map((f) => f.text).join(' '));
    expect(new Set(texts).size).toBe(kinds.length);
  });

  it('says nothing rather than padding when the numbers do not support it', () => {
    // No outgoings recorded means the months-of-cover statement cannot be made.
    const found = kindFindings({ ...base, kind: 'emergency_fund', monthlyOutgoingsMinor: null });
    expect(found.some((f) => /months? of outgoings set aside/.test(f.text))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { holdingInput, holdingValues } from './holding-input';

const draft = { name: 'My fund', symbol: 'vfv', quantity: '2.5000000001', currency: 'cad', currentValue: '1000.015', costBasis: '900.00' };
describe('manual holding input', () => {
  it('normalizes metadata and parses money into exact minor units', () => {
    const parsed = holdingInput.parse(draft);
    expect(holdingValues(parsed)).toEqual({ name: 'My fund', symbol: 'VFV', quantity: '2.5000000001', currency: 'CAD', currentValueMinor: 100002n, costBasisMinor: 90000n });
  });
  it('respects currencies without cents', () => {
    expect(holdingValues(holdingInput.parse({ ...draft, currency: 'JPY', currentValue: '1000.5' })).currentValueMinor).toBe(1001n);
  });
  it('allows unlisted and manually valued holdings', () => {
    expect(holdingValues(holdingInput.parse({ ...draft, symbol: '', quantity: '0' })).symbol).toBeNull();
  });
  it.each([
    { name: '' }, { currentValue: '-1' }, { currentValue: 'NaN' }, { currentValue: '1e5' },
    { costBasis: '-10' }, { currency: 'XYZ' }, { quantity: '-2' }, { quantity: '1.00000000001' },
    { quantity: '1234567890123456789' }, { symbol: '<script>' },
  ])('rejects invalid financial input %j before storage', (patch) => {
    expect(holdingInput.safeParse({ ...draft, ...patch }).success).toBe(false);
  });
});

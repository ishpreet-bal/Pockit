import { describe, expect, it } from 'vitest';
import { totalHoldings, valueHolding, type HoldingValue } from './valuation';
import type { Quote } from '@/lib/market/types';

const holding: HoldingValue = { id: 'h1', symbol: 'AAPL', name: 'Apple', quantity: '1.2500000000', currency: 'USD', currentValueMinor: 20000n, costBasisMinor: 18000n, valueAsOf: '2026-10-01' };
const quote: Quote = { symbol: 'AAPL', currency: 'USD', priceMinor: 18001n, changeMinor: 100n, changeBps: 56, previousCloseMinor: 17901n, dayHighMinor: null, dayLowMinor: null, source: 'Provider', asOf: '2026-11-03', simulated: false };

describe('holding valuation', () => {
  it('multiplies a decimal quantity in exact minor units and rounds once', () => {
    expect(valueHolding(holding, quote)).toMatchObject({ valueMinor: 22501n, gainMinor: 4501n, valuation: 'quote', source: 'Provider', asOf: '2026-11-03' });
    expect(valueHolding({ ...holding, quantity: '0.5' }, { ...quote, priceMinor: 1n }).valueMinor).toBe(1n);
  });
  it('never overwrites a real holding with sample prices', () => {
    expect(valueHolding(holding, { ...quote, simulated: true })).toMatchObject({ valueMinor: 20000n, changePct: null, valuation: 'recorded', asOf: '2026-10-01' });
  });
  it('keeps the recorded value when the quote uses a different currency', () => {
    expect(valueHolding(holding, { ...quote, currency: 'CAD' }).valueMinor).toBe(20000n);
  });
  it('rejects a mismatched symbol', () => {
    expect(valueHolding(holding, { ...quote, symbol: 'NVDA' }).valuation).toBe('recorded');
  });
  it.each(['0', '-3', 'NaN', '1e2'])('uses recorded value for unusable quantity %s', (quantity) => {
    expect(valueHolding({ ...holding, quantity }, quote).valuation).toBe('recorded');
  });
  it('retains recorded values when the provider is unavailable', () => {
    expect(valueHolding(holding)).toMatchObject({ valueMinor: 20000n, source: 'Recorded value', changePct: null });
  });
  it('does not lose integer precision for large holdings', () => {
    expect(valueHolding({ ...holding, quantity: '1.0000000001' }, { ...quote, priceMinor: 9007199254740993n }).valueMinor).toBe(9007199255641713n);
  });
  it('totals each currency separately with consistent cost and gains', () => {
    const totals = totalHoldings([
      valueHolding(holding),
      valueHolding({ ...holding, id: 'h2', currency: 'CAD', currentValueMinor: 30000n, costBasisMinor: 25000n }),
      valueHolding({ ...holding, id: 'h3', currentValueMinor: 10000n, costBasisMinor: 7000n }),
    ]);
    expect(totals).toMatchObject([
      { currency: 'CAD', valueMinor: 30000n, costMinor: 25000n, gainMinor: 5000n, gainPct: 20, recordedCount: 1 },
      { currency: 'USD', valueMinor: 30000n, costMinor: 25000n, gainMinor: 5000n, gainPct: 20, recordedCount: 2 },
    ]);
  });
});

import { mulRatio } from '@/lib/money';
import type { Quote } from '@/lib/market/types';

export interface HoldingValue {
  id: string;
  symbol: string | null;
  name: string;
  quantity: string;
  currency: string;
  currentValueMinor: bigint;
  costBasisMinor: bigint;
  valueAsOf: string | null;
}

/** A recorded holding must never be repriced using an illustrative or foreign-currency quote. */
export function valueHolding(holding: HoldingValue, quote?: Quote) {
  const usable = quote && !quote.simulated && quote.symbol.toUpperCase() === holding.symbol?.toUpperCase() && quote.currency.toUpperCase() === holding.currency.toUpperCase()
    && quote.priceMinor > 0n && /^\d+(\.\d+)?$/.test(holding.quantity) && /[1-9]/.test(holding.quantity);
  // Quantity is a decimal string from Postgres. Reuse exact ratio arithmetic,
  // rounding only after multiplication, rather than converting money to floats.
  const exactValue = usable ? multiplyPrice(quote.priceMinor, holding.quantity) : holding.currentValueMinor;
  return {
    id: holding.id, symbol: holding.symbol, name: holding.name, currency: holding.currency.toUpperCase(),
    valueMinor: exactValue, costMinor: holding.costBasisMinor, gainMinor: exactValue - holding.costBasisMinor,
    changePct: usable && quote.changeBps !== null ? quote.changeBps / 100 : null,
    valuation: usable ? 'quote' as const : 'recorded' as const,
    source: usable ? quote.source : 'Recorded value', asOf: usable ? quote.asOf : holding.valueAsOf,
  };
}

function multiplyPrice(price: bigint, quantity: string): bigint {
  const [whole, fraction = ''] = quantity.split('.');
  const denominator = 10n ** BigInt(fraction.length);
  return mulRatio(price, BigInt(whole! + fraction), denominator);
}

/** Without an explicit FX rate, different currencies are separate totals. */
export function totalHoldings(positions: ReturnType<typeof valueHolding>[]) {
  const grouped = new Map<string, { currency: string; valueMinor: bigint; costMinor: bigint; recordedCount: number }>();
  for (const position of positions) {
    const total = grouped.get(position.currency) ?? { currency: position.currency, valueMinor: 0n, costMinor: 0n, recordedCount: 0 };
    total.valueMinor += position.valueMinor;
    total.costMinor += position.costMinor;
    if (position.valuation === 'recorded') total.recordedCount++;
    grouped.set(position.currency, total);
  }
  return [...grouped.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map((total) => ({
    ...total, gainMinor: total.valueMinor - total.costMinor,
    gainPct: total.costMinor > 0n ? Number(mulRatio(total.valueMinor - total.costMinor, 10000n, total.costMinor)) / 100 : null,
  }));
}

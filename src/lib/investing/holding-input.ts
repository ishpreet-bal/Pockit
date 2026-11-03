import { z } from 'zod';
import { isSupportedCurrency, parseMoney } from '@/lib/money';

const amount = z.string().trim().regex(/^\d{1,13}(\.\d{1,3})?$/, 'Enter a positive amount or zero, using a decimal point.');
export const holdingInput = z.object({
  name: z.string().trim().min(1, 'Give this holding a name.').max(120),
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9.\-^=]{0,12}$/, 'Use a valid ticker, or leave it blank.').default(''),
  currency: z.string().trim().toUpperCase().refine(isSupportedCurrency, 'Choose a supported currency.'),
  quantity: z.string().trim().regex(/^\d{1,18}(\.\d{1,10})?$/, 'Enter units with up to 10 decimal places.').default('0'),
  currentValue: amount,
  costBasis: amount,
});

export function holdingValues(input: z.infer<typeof holdingInput>) {
  return {
    name: input.name, symbol: input.symbol || null, currency: input.currency,
    quantity: input.quantity, currentValueMinor: parseMoney(input.currentValue, input.currency)!,
    costBasisMinor: parseMoney(input.costBasis, input.currency)!,
  };
}

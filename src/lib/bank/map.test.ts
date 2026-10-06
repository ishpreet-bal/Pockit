import { describe, expect, it } from 'vitest';
import { accountType, categorySlug, signedMinor, txType } from './map';

describe('Plaid → Pockit', () => {
  it('maps account types', () => {
    expect(accountType({ type: 'depository', subtype: 'checking' })).toBe('chequing');
    expect(accountType({ type: 'depository', subtype: 'savings' })).toBe('savings');
    expect(accountType({ type: 'credit', subtype: 'credit card' })).toBe('credit_card');
    expect(accountType({ type: 'loan', subtype: 'mortgage' })).toBe('mortgage');
  });

  it('a $12.50 coffee lowers chequing but raises what’s owed on a card', () => {
    const coffee = { amount: 12.5, personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' } };
    expect(signedMinor(coffee, 'chequing')).toBe(-1250n);
    expect(signedMinor(coffee, 'credit_card')).toBe(1250n);
    expect(txType(coffee, 'chequing')).toBe('expense');
    expect(categorySlug(coffee)).toBe('coffee');
  });

  it('pay is income; a card refund is a refund; transfers never count as spending', () => {
    expect(txType({ amount: -2100, personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_WAGES' } }, 'chequing')).toBe('income');
    expect(txType({ amount: -40, personal_finance_category: { primary: 'GENERAL_MERCHANDISE', detailed: 'X' } }, 'credit_card')).toBe('refund');
    expect(txType({ amount: 500, personal_finance_category: { primary: 'TRANSFER_OUT', detailed: 'X' } }, 'chequing')).toBe('transfer');
    expect(txType({ amount: 300, personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' } }, 'chequing')).toBe('debt_payment');
    expect(txType({ amount: -300, personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: 'X' } }, 'credit_card')).toBe('transfer');
  });

  it('falls back from detailed to broad categories', () => {
    expect(categorySlug({ personal_finance_category: { primary: 'TRAVEL', detailed: 'TRAVEL_FLIGHTS' } })).toBe('travel');
    expect(categorySlug({ personal_finance_category: null })).toBeNull();
  });
});

describe('bank token sealing', () => {
  it('round-trips and is not readable at rest', async () => {
    process.env.AUTH_SECRET = 'x'.repeat(40);
    const { sealToken, openToken } = await import('./plaid');
    const sealed = sealToken('access-sandbox-123');
    expect(sealed).not.toContain('access-sandbox');
    expect(openToken(sealed)).toBe('access-sandbox-123');
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A') + sealed.slice(-1);
    expect(() => openToken(tampered)).toThrow();
  });
});

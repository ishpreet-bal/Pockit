import { describe, expect, it } from 'vitest';
import { accountType, categorySlug, signedMinor, textType, txType } from './map';

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
    const ws = '11111111-1111-4111-8111-111111111111';
    const sealed = sealToken('access-sandbox-123', ws);
    expect(sealed).not.toContain('access-sandbox');
    expect(sealed.startsWith('v2.')).toBe(true);
    expect(openToken(sealed, ws)).toBe('access-sandbox-123');
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A') + sealed.slice(-1);
    expect(() => openToken(tampered, ws)).toThrow();
  });

  it('a token copied onto another space will not open', async () => {
    process.env.AUTH_SECRET = 'x'.repeat(40);
    const { sealToken, openToken, TokenUnreadable } = await import('./plaid');
    const sealed = sealToken('access-sandbox-123', '11111111-1111-4111-8111-111111111111');
    expect(() => openToken(sealed, '22222222-2222-4222-8222-222222222222')).toThrow(TokenUnreadable);
  });

  it('a dedicated BANK_TOKEN_KEY is used, and older tokens still open', async () => {
    process.env.AUTH_SECRET = 'x'.repeat(40);
    const { sealToken, openToken } = await import('./plaid');
    const ws = '11111111-1111-4111-8111-111111111111';
    const before = sealToken('old', ws);
    process.env.BANK_TOKEN_KEY = 'k'.repeat(40);
    const after = sealToken('new', ws);
    expect(openToken(before, ws)).toBe('old');
    expect(openToken(after, ws)).toBe('new');
    process.env.AUTH_SECRET = 'y'.repeat(40); // rotating AUTH_SECRET no longer disconnects banks
    expect(openToken(after, ws)).toBe('new');
    expect(() => openToken(before, ws)).toThrow();
    delete process.env.BANK_TOKEN_KEY;
  });
});

describe('what the bank\'s own wording says', () => {
  const misc = { primary: 'GENERAL_SERVICES', detailed: 'GENERAL_SERVICES_OTHER_GENERAL_SERVICES' };
  it('a card payment is never spending, on either side', () => {
    expect(txType({ amount: -642, name: 'PAYMENT - THANK YOU', personal_finance_category: misc }, 'credit_card')).toBe('transfer');
    expect(txType({ amount: -642, name: 'PAIEMENT - MERCI', personal_finance_category: misc }, 'credit_card')).toBe('transfer');
    expect(txType({ amount: 642, name: 'AMEX BILL PYMT', personal_finance_category: misc }, 'chequing')).toBe('debt_payment');
    expect(txType({ amount: 300, name: 'CIBC VISA PAYMENT', personal_finance_category: misc }, 'chequing')).toBe('debt_payment');
    expect(txType({ amount: 300, name: 'TD VISA PREAUTH PYMT', personal_finance_category: misc }, 'chequing')).toBe('debt_payment');
  });
  it('a refund on a card is still a refund', () => {
    expect(txType({ amount: -40, name: 'AMAZON.CA REFUND', personal_finance_category: misc }, 'credit_card')).toBe('refund');
  });
  it('moving money between your own accounts is a transfer', () => {
    expect(txType({ amount: 200, name: 'TFR-TO 6123456', personal_finance_category: misc }, 'chequing')).toBe('transfer');
    expect(txType({ amount: 200, name: 'Online Banking transfer to savings', personal_finance_category: misc }, 'chequing')).toBe('transfer');
  });
  it('an e-Transfer you send is money gone, even if the bank calls it a transfer', () => {
    expect(txType({ amount: 1450, name: 'SEND E-TFR ***Jx2 E-TRANSFER', personal_finance_category: { primary: 'TRANSFER_OUT', detailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER' } }, 'chequing')).toBe('expense');
    // Money sent TO you could be a friend paying back: not income, Plaid's call stands.
    expect(textType('E-TRANSFER RECEIVED Sam', 'chequing', false)).toBeNull();
  });
  it('an ordinary purchase is left to Plaid', () => {
    expect(textType('TIM HORTONS #1234', 'chequing', true)).toBeNull();
    expect(textType('VISA DEBIT PURCHASE LOBLAWS', 'chequing', true)).toBeNull();
  });
});


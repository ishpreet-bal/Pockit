import { describe, expect, it } from 'vitest';
import { cardsDue, nextDayOfMonth } from './cards';

const base = { id: 'c', name: 'Visa', mask: '3333', institution: 'TD', balanceMinor: 64255, paymentDueDate: null, paymentDueDay: null, statementBalanceMinor: null, minimumPaymentMinor: null, lastPaymentDate: null, lastStatementDate: null };

describe('credit card payments coming up', () => {
  it('uses the bank statement when there is one', () => {
    const [c] = cardsDue([{ ...base, paymentDueDate: '2026-11-21', statementBalanceMinor: 58812, minimumPaymentMinor: 2500, lastStatementDate: '2026-10-31', lastPaymentDate: '2026-10-19' }], '2026-11-12');
    expect(c).toMatchObject({ dueDate: '2026-11-21', daysLeft: 9, statementMinor: 58812, minimumMinor: 2500, paid: false, source: 'statement' });
  });
  it('a payment after the statement means it is paid', () => {
    const [c] = cardsDue([{ ...base, paymentDueDate: '2026-11-21', statementBalanceMinor: 58812, lastStatementDate: '2026-10-31', lastPaymentDate: '2026-11-05' }], '2026-11-12');
    expect(c!.paid).toBe(true);
  });
  it('a typed-in day of the month rolls to next month once it has passed', () => {
    const [c] = cardsDue([{ ...base, paymentDueDay: 5 }], '2026-11-12');
    expect(c).toMatchObject({ dueDate: '2026-12-05', source: 'day', statementMinor: 64255 });
  });
  it('day 31 in a short month lands on its last day', () => {
    expect(nextDayOfMonth('2027-02-10', 31)).toBe('2027-02-28');
  });
  it('an old statement date becomes the same day next month', () => {
    const [c] = cardsDue([{ ...base, paymentDueDate: '2026-10-21' }], '2026-11-12');
    expect(c!.dueDate).toBe('2026-11-21');
  });
  it('cards with no due date are left out, and the soonest comes first', () => {
    const list = cardsDue([{ ...base, id: 'a' }, { ...base, id: 'b', paymentDueDay: 28 }, { ...base, id: 'd', paymentDueDay: 15 }], '2026-11-12');
    expect(list.map((c) => c.id)).toEqual(['d', 'b']);
  });
});

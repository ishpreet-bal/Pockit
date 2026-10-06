import { describe, expect, it } from 'vitest';
// Runs only against a local database, with a test user and workspace:
//   DB_IT=1 IT_USER=<uuid> IT_WORKSPACE=<uuid> npx vitest run src/lib/bank/sync.integration.test.ts
const run = process.env.DB_IT === '1' && process.env.IT_USER && process.env.IT_WORKSPACE ? describe : describe.skip;

run('bank sync against a real database', () => {
  it('creates accounts, adds posted transactions once, applies changes and removals', async () => {
    const { applySync } = await import('./sync');
    const { withUser } = await import('@/lib/db/client');
    const { bankConnections, transactions, accounts } = await import('@/lib/db/schema');
    const { eq, and, isNull } = await import('drizzle-orm');
    const ctx = { userId: process.env.IT_USER!, workspaceId: process.env.IT_WORKSPACE!, currency: 'CAD' };
    const conn = (await withUser(ctx.userId, (tx) => tx.insert(bankConnections).values({ workspaceId: ctx.workspaceId, itemId: 'item-' + Date.now(), accessTokenEnc: 'v1.x.y.z', institutionName: 'Test Bank' }).returning({ id: bankConnections.id })))[0]!;
    const accts = [
      { account_id: 'chq', name: 'Chequing', mask: '1234', type: 'depository', subtype: 'checking', balances: { current: 1500.25, iso_currency_code: 'CAD' } },
      { account_id: 'cc', name: 'Visa', mask: '9876', type: 'credit', subtype: 'credit card', balances: { current: 320, iso_currency_code: 'CAD' } },
    ];
    const t = (id: string, account_id: string, amount: number, extra = {}) => ({ transaction_id: id, account_id, amount, date: '2026-10-03', name: 'TIM HORTONS #123', merchant_name: 'Tim Hortons', pending: false, personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' }, ...extra });
    const first = await applySync(ctx, conn.id, 'Test Bank', accts, { added: [t('a', 'chq', 4.85), t('b', 'cc', 60), t('p', 'chq', 9, { pending: true }), t('pay', 'chq', -2100, { personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_WAGES' } })], modified: [], removed: [] });
    expect(first).toEqual({ accounts: 2, added: 3, updated: 0, removed: 0 });
    const again = await applySync(ctx, conn.id, 'Test Bank', accts, { added: [t('a', 'chq', 4.85)], modified: [t('b', 'cc', 65)], removed: [{ transaction_id: 'pay' }] });
    expect(again).toEqual({ accounts: 2, added: 0, updated: 1, removed: 1 });
    const rows = await withUser(ctx.userId, (tx) => tx.select({ e: transactions.externalId, amt: transactions.amountMinor, type: transactions.type, del: transactions.deletedAt }).from(transactions).where(eq(transactions.workspaceId, ctx.workspaceId)));
    const by = Object.fromEntries(rows.filter((r) => r.e).map((r) => [r.e, r]));
    expect(by.a!.amt).toBe(-485n);          // coffee lowers chequing
    expect(by.b!.amt).toBe(6500n);          // card purchase raises what's owed, after the bank's correction
    expect(by.pay!.type).toBe('income');
    expect(by.pay!.del).not.toBeNull();     // removed by the bank → hidden
    expect(by.p).toBeUndefined();           // pending never stored
    const acc = await withUser(ctx.userId, (tx) => tx.select({ name: accounts.name, type: accounts.type, nb: accounts.normalBalance, bal: accounts.openingBalanceMinor }).from(accounts).where(and(eq(accounts.workspaceId, ctx.workspaceId), eq(accounts.externalProvider, 'plaid:' + conn.id))));
    expect(acc.find((a) => a.type === 'credit_card')).toMatchObject({ name: 'Test Bank Visa', nb: 'credit', bal: 32000n });
    expect(acc.find((a) => a.type === 'chequing')!.bal).toBe(150025n);
    void isNull;
  });
});

import 'server-only';
import { and, eq, inArray, isNull, notExists, sql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import {
  accounts, assets, bankConnections, budgetAllocations, budgets, debts, goals, holdings, iouDebts, liabilities,
  transactions, workspaces,
} from '@/lib/db/schema';

/**
 * Sample money ("Load sample data", the look-around tour) taken back out of a
 * workspace, leaving everything the person added themselves.
 *
 * Sample purchases carry source = 'demo'. Everything else the sample creates is
 * matched on exactly what src/lib/data/demo.ts writes (names AND amounts), so a
 * real goal someone happens to call "Emergency fund" is never touched. Keep the two
 * files in step.
 */

const SAMPLE_ACCOUNTS: [string, string][] = [
  ['Everyday Chequing', 'TD'], ['High-Interest Savings', 'TD'], ['Visa Infinite', 'RBC'], ['TFSA', 'TD'],
];

export async function hasSampleData(userId: string, workspaceId: string): Promise<boolean> {
  return withUser(userId, async (tx) => {
    const ws = await tx.select({ isDemo: workspaces.isDemo }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (ws[0]?.isDemo) return true;
    const t = await tx.select({ id: transactions.id }).from(transactions)
      .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.source, 'demo'))).limit(1);
    return t.length > 0;
  });
}

/** Removes the sample rows only. Returns how many sample purchases went. */
export async function clearSampleData(userId: string, workspaceId: string): Promise<number> {
  return withUser(userId, async (tx) => {
    const ws = workspaceId;
    const removed = await tx.delete(transactions)
      .where(and(eq(transactions.workspaceId, ws), eq(transactions.source, 'demo')))
      .returning({ id: transactions.id });

    await tx.delete(iouDebts).where(and(eq(iouDebts.workspaceId, ws), eq(iouDebts.person, 'Priya'), eq(iouDebts.description, 'Concert tickets'), eq(iouDebts.amountMinor, 4_500n)));
    await tx.delete(goals).where(and(eq(goals.workspaceId, ws), sql`(${goals.name}, ${goals.targetMinor}) in (('Emergency fund', 1500000), ('Japan trip', 700000), ('New car', 2500000))`));
    const sampleBudgets = await tx.select({ id: budgets.id }).from(budgets)
      .where(and(eq(budgets.workspaceId, ws), eq(budgets.name, 'Monthly budget'), eq(budgets.expectedIncomeMinor, 463_000n)));
    if (sampleBudgets.length) {
      const ids = sampleBudgets.map((b) => b.id);
      await tx.delete(budgetAllocations).where(inArray(budgetAllocations.budgetId, ids));
      await tx.delete(budgets).where(inArray(budgets.id, ids));
    }
    await tx.delete(assets).where(and(eq(assets.workspaceId, ws), eq(assets.name, 'Vehicle (2021 Civic)'), eq(assets.valueMinor, 1_850_000n)));
    await tx.delete(liabilities).where(and(eq(liabilities.workspaceId, ws), eq(liabilities.name, 'Student loan'), eq(liabilities.balanceMinor, 1_120_000n)));
    await tx.delete(holdings).where(and(eq(holdings.workspaceId, ws), sql`(${holdings.symbol}, ${holdings.costBasisMinor}) in (('VFV', 1420000), ('XEQT', 430000))`));
    await tx.delete(debts).where(and(eq(debts.workspaceId, ws), sql`(${debts.name}, ${debts.balanceMinor}) in (('Student loan', 1120000), ('Visa Infinite', 186000))`));

    // The sample's accounts, only if nothing real points at them: never a bank's account.
    for (const [name, institution] of SAMPLE_ACCOUNTS) {
      await tx.delete(accounts).where(and(
        eq(accounts.workspaceId, ws), eq(accounts.name, name), eq(accounts.institution, institution), isNull(accounts.externalProvider),
        notExists(tx.select({ one: sql`1` }).from(transactions).where(eq(transactions.accountId, accounts.id))),
        notExists(tx.select({ one: sql`1` }).from(holdings).where(eq(holdings.accountId, accounts.id))),
        notExists(tx.select({ one: sql`1` }).from(goals).where(eq(goals.accountId, accounts.id))),
        notExists(tx.select({ one: sql`1` }).from(debts).where(eq(debts.accountId, accounts.id))),
      ));
    }
    await tx.update(workspaces).set({ isDemo: false }).where(eq(workspaces.id, ws));
    return removed.length;
  });
}

/** True when the workspace has nothing of the person's own: no bank and nothing they added. */
export async function onlySampleData(userId: string, workspaceId: string): Promise<boolean> {
  return withUser(userId, async (tx) => {
    const bank = await tx.select({ id: bankConnections.id }).from(bankConnections).where(eq(bankConnections.workspaceId, workspaceId)).limit(1);
    if (bank.length) return false;
    const own = await tx.select({ id: transactions.id }).from(transactions)
      .where(and(eq(transactions.workspaceId, workspaceId), sql`${transactions.source} <> 'demo'`)).limit(1);
    return own.length === 0;
  });
}

import 'server-only';
import { and, desc, eq, gte, isNull, sql as dsql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { accounts, categories, iouDebts, transactions } from '@/lib/db/schema';
import { absMinor, minorFromDb } from '@/lib/money';
import { listShares } from './cost-shares';
import { perPerson, personKey } from '@/lib/finance/friends';

/**
 * Split with friends: one balance per person, both ways, like Splitwise but kept
 * to your own money. Nobody else needs an account.
 *
 *  - They owe you: purchases you paid for and split (cost_shares, drizzle/0011).
 *  - You owe them: something they paid for where your part is yours (iou_debts,
 *    drizzle/0017). Your part is your spending the day it happened; paying them back
 *    from your bank is linked so it is not counted a second time.
 */

type Scope = { userId: string; workspaceId: string };
const n = (v: unknown) => minorFromDb(v as string);

export interface FriendItem {
  kind: 'owes-you' | 'you-owe';
  /** cost share id (owes-you) or IOU id (you-owe). */
  id: string;
  transactionId: string;
  what: string;
  date: string;
  amountMinor: number;
}
export interface Friend { key: string; name: string; owesYouMinor: number; youOweMinor: number; netMinor: number; items: FriendItem[] }

export async function listFriends(scope: Scope) {
  const shares = (await listShares(scope)).filter((s) => s.expectBack && s.owedMinor > 0);
  const ious = await withUser(scope.userId, (tx) => tx.select({ debt: iouDebts, date: transactions.postedDate })
    .from(iouDebts).innerJoin(transactions, eq(transactions.id, iouDebts.transactionId))
    .where(and(eq(iouDebts.workspaceId, scope.workspaceId), isNull(iouDebts.settledAt), isNull(transactions.deletedAt)))
    .orderBy(desc(transactions.postedDate)));

  const people = new Map<string, Friend>();
  const person = (name: string) => {
    const key = personKey(name);
    let f = people.get(key);
    if (!f) { f = { key, name: name.trim(), owesYouMinor: 0, youOweMinor: 0, netMinor: 0, items: [] }; people.set(key, f); }
    return f;
  };
  for (const s of shares) {
    for (const p of perPerson(s)) {
      if (p.amountMinor <= 0) continue;
      const f = person(p.name);
      f.owesYouMinor += p.amountMinor;
      f.items.push({ kind: 'owes-you', id: s.id, transactionId: s.transactionId, what: s.purchase.name, date: s.purchase.date, amountMinor: p.amountMinor });
    }
  }
  for (const { debt, date } of ious) {
    const amount = Number(n(debt.amountMinor));
    const f = person(debt.person);
    f.youOweMinor += amount;
    f.items.push({ kind: 'you-owe', id: debt.id, transactionId: debt.transactionId, what: debt.description, date, amountMinor: amount });
  }
  const list = [...people.values()].map((f) => ({ ...f, netMinor: f.owesYouMinor - f.youOweMinor, items: f.items.sort((a, b) => (a.date < b.date ? 1 : -1)) }))
    .sort((a, b) => Math.abs(b.netMinor) - Math.abs(a.netMinor));
  return {
    people: list,
    owesYouMinor: list.reduce((s, f) => s + f.owesYouMinor, 0),
    youOweMinor: list.reduce((s, f) => s + f.youOweMinor, 0),
  };
}

export type IouResult = { ok: true; id: string } | { ok: false; error: string; status: number };

/** "Priya paid for dinner; my part was $18." Books your part as spending today (or on `date`). */
export async function addIou(scope: Scope, input: { person: string; description: string; amountMinor: number; categoryId?: string | null; date?: string | null }): Promise<IouResult> {
  const person = input.person.trim();
  const description = input.description.trim();
  if (!person || person.length > 80) return { ok: false, error: 'Who do you owe?', status: 400 };
  if (!description || description.length > 200) return { ok: false, error: 'What was it for?', status: 400 };
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) return { ok: false, error: 'Enter your part.', status: 400 };
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : new Date().toISOString().slice(0, 10);

  return withUser(scope.userId, async (tx) => {
    // Your everyday account: the money leaves from there when you pay them back.
    const accts = await tx.select({ id: accounts.id, type: accounts.type, currency: accounts.currency, nb: accounts.normalBalance })
      .from(accounts).where(and(eq(accounts.workspaceId, scope.workspaceId), eq(accounts.isActive, true)));
    const acct = accts.find((a) => a.type === 'chequing') ?? accts.find((a) => a.nb === 'debit') ?? accts[0];
    if (!acct) return { ok: false as const, error: 'Add an account first, under Accounts.', status: 400 };
    if (input.categoryId) {
      const cat = await tx.select({ kind: categories.kind }).from(categories)
        .where(and(eq(categories.id, input.categoryId), eq(categories.workspaceId, scope.workspaceId))).limit(1);
      if (!cat[0] || cat[0].kind !== 'expense') return { ok: false as const, error: 'Pick a spending category.', status: 400 };
    }
    const amount = BigInt(input.amountMinor);
    const signed = acct.nb === 'credit' ? amount : -amount;
    const made = await tx.insert(transactions).values({
      workspaceId: scope.workspaceId, accountId: acct.id, postedDate: date,
      description, originalDescription: description, merchantName: description,
      amountMinor: signed, currency: acct.currency, baseAmountMinor: signed, baseCurrency: acct.currency,
      type: 'expense', categoryId: input.categoryId ?? null, source: 'manual', createdBy: scope.userId,
      notes: `Your part; ${person} paid`,
    }).returning({ id: transactions.id });
    const debt = await tx.insert(iouDebts).values({
      workspaceId: scope.workspaceId, person, description, amountMinor: amount, transactionId: made[0]!.id, createdBy: scope.userId,
    }).returning({ id: iouDebts.id });
    return { ok: true as const, id: debt[0]!.id };
  });
}

/**
 * You paid them back. With `transactionId`, that bank payment is the payback: it
 * becomes a transfer so it isn't counted as spending on top of your part.
 */
export async function settleIou(scope: Scope, id: string, input: { transactionId?: string | null }): Promise<IouResult> {
  return withUser(scope.userId, async (tx) => {
    const debt = (await tx.select().from(iouDebts).where(and(eq(iouDebts.id, id), eq(iouDebts.workspaceId, scope.workspaceId))).limit(1))[0];
    if (!debt) return { ok: false as const, error: 'That could not be found.', status: 404 };
    if (debt.settledAt) return { ok: false as const, error: 'Already paid back.', status: 400 };
    if (input.transactionId) {
      const pay = (await tx.select({ type: transactions.type, base: transactions.baseAmountMinor }).from(transactions)
        .where(and(eq(transactions.id, input.transactionId), eq(transactions.workspaceId, scope.workspaceId), isNull(transactions.deletedAt))).limit(1))[0];
      if (!pay || pay.type !== 'expense' || input.transactionId === debt.transactionId) return { ok: false as const, error: 'Pick the payment you sent them.', status: 400 };
      const taken = await tx.select({ id: iouDebts.id }).from(iouDebts).where(eq(iouDebts.settleTransactionId, input.transactionId)).limit(1);
      if (taken[0]) return { ok: false as const, error: 'That payment is already a payback.', status: 409 };
      await tx.update(transactions).set({ type: 'transfer', updatedAt: new Date() }).where(eq(transactions.id, input.transactionId));
    }
    await tx.update(iouDebts).set({ settledAt: new Date(), settleTransactionId: input.transactionId ?? null }).where(eq(iouDebts.id, id));
    return { ok: true as const, id };
  });
}

/** Remove an IOU entered by mistake, with the spending it booked. */
export async function removeIou(scope: Scope, id: string): Promise<boolean> {
  return withUser(scope.userId, async (tx) => {
    const debt = (await tx.select().from(iouDebts).where(and(eq(iouDebts.id, id), eq(iouDebts.workspaceId, scope.workspaceId))).limit(1))[0];
    if (!debt) return false;
    if (debt.settleTransactionId) {
      await tx.update(transactions).set({ type: 'expense', updatedAt: new Date() }).where(eq(transactions.id, debt.settleTransactionId));
    }
    // Deleting the booked spending removes the IOU with it (ON DELETE CASCADE).
    await tx.delete(transactions).where(and(eq(transactions.id, debt.transactionId), eq(transactions.workspaceId, scope.workspaceId)));
    return true;
  });
}

/** Recent money out that could be a payback to a friend: e-Transfers and the like, not already linked. */
export async function candidatePayments(scope: Scope, sinceIso: string) {
  return withUser(scope.userId, async (tx) => {
    const rows = await tx.select({ id: transactions.id, description: transactions.description, merchantName: transactions.merchantName, date: transactions.postedDate, base: transactions.baseAmountMinor })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(and(
        eq(transactions.workspaceId, scope.workspaceId), isNull(transactions.deletedAt),
        eq(transactions.type, 'expense'), gte(transactions.postedDate, sinceIso), eq(accounts.normalBalance, 'debit'),
        dsql`NOT EXISTS (SELECT 1 FROM pockit.iou_debts d WHERE d.transaction_id = ${transactions.id} OR d.settle_transaction_id = ${transactions.id})`,
      ))
      .orderBy(desc(transactions.postedDate))
      .limit(40);
    return rows.map((r) => ({ id: r.id, name: r.merchantName ?? r.description, date: r.date, amountMinor: Number(absMinor(n(r.base))) }));
  });
}

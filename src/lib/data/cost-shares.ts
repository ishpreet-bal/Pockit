import 'server-only';
import { and, desc, eq, gte, inArray, isNull, sql as dsql } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { costRepayments, costShares, transactions } from '@/lib/db/schema';
import { minorFromDb, absMinor } from '@/lib/money';
import { describeShare, owedMinor, shareAmounts, type CostShareChoice, type CostShareKind } from '@/lib/finance/cost-share';

/**
 * Split expenses for one workspace: reading them for the screens, and the few
 * writes (set, clear, record a payback). The ledger reads them separately, through
 * WorkspaceRepo, so spending totals never depend on this module.
 */

type Scope = { userId: string; workspaceId: string };
const n = (v: unknown) => minorFromDb(v as string);

export interface ShareView {
  id: string;
  transactionId: string;
  kind: CostShareKind;
  people: number | null;
  even: boolean;
  expectBack: boolean;
  withWhom: string | null;
  label: string;
  totalMinor: number;
  mineMinor: number;
  othersMinor: number;
  eachMinor: number | null;
  repaidMinor: number;
  owedMinor: number;
  settled: boolean;
  /** The purchase, so a list can show it without another request. */
  purchase: { name: string; date: string };
  repayments: { id: string; amountMinor: number; receivedOn: string; transactionId: string | null; person: string | null }[];
}

function toView(
  row: typeof costShares.$inferSelect,
  txn: { description: string; merchantName: string | null; postedDate: string; baseAmountMinor: unknown },
  repays: (typeof costRepayments.$inferSelect)[],
): ShareView {
  const choice: CostShareChoice = {
    kind: row.kind as CostShareKind,
    people: row.people,
    mineMinor: row.mineMinor === null ? null : n(row.mineMinor),
    expectBack: row.expectBack,
  };
  const total = absMinor(n(txn.baseAmountMinor));
  const amounts = shareAmounts(total, choice);
  const repaid = repays.reduce((s, r) => s + n(r.amountMinor), 0n);
  const owed = owedMinor(amounts, choice, repaid);
  return {
    id: row.id,
    transactionId: row.transactionId,
    kind: choice.kind,
    people: row.people,
    even: row.mineMinor === null,
    expectBack: row.expectBack,
    withWhom: row.withWhom,
    label: describeShare(choice, row.withWhom),
    totalMinor: Number(total),
    mineMinor: Number(amounts.mineMinor),
    othersMinor: Number(amounts.othersMinor),
    eachMinor: amounts.eachMinor === null ? null : Number(amounts.eachMinor),
    repaidMinor: Number(repaid),
    owedMinor: Number(owed),
    settled: row.expectBack ? owed === 0n : true,
    purchase: { name: txn.merchantName ?? txn.description, date: txn.postedDate },
    repayments: repays
      .sort((a, b) => (a.receivedOn < b.receivedOn ? 1 : -1))
      .map((r) => ({ id: r.id, amountMinor: Number(n(r.amountMinor)), receivedOn: r.receivedOn, transactionId: r.transactionId, person: r.person })),
  };
}

/** Every split expense on purchases that still exist, newest purchase first. */
export async function listShares(scope: Scope): Promise<ShareView[]> {
  return withUser(scope.userId, async (tx) => {
    const rows = await tx.select({ share: costShares, txn: transactions })
      .from(costShares)
      .innerJoin(transactions, eq(transactions.id, costShares.transactionId))
      .where(and(eq(costShares.workspaceId, scope.workspaceId), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.postedDate));
    if (rows.length === 0) return [];
    const repays = await tx.select().from(costRepayments)
      .where(and(eq(costRepayments.workspaceId, scope.workspaceId), inArray(costRepayments.costShareId, rows.map((r) => r.share.id))));
    return rows.map((r) => toView(r.share, r.txn, repays.filter((p) => p.costShareId === r.share.id)));
  });
}

export async function shareForTransaction(scope: Scope, transactionId: string): Promise<ShareView | null> {
  return withUser(scope.userId, async (tx) => {
    const rows = await tx.select({ share: costShares, txn: transactions })
      .from(costShares)
      .innerJoin(transactions, eq(transactions.id, costShares.transactionId))
      .where(and(eq(costShares.workspaceId, scope.workspaceId), eq(costShares.transactionId, transactionId)))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    const repays = await tx.select().from(costRepayments).where(eq(costRepayments.costShareId, r.share.id));
    return toView(r.share, r.txn, repays);
  });
}

export interface ShareInput {
  kind: CostShareKind;
  people?: number | null;
  /** Your part, in minor units, for an uneven split. */
  mineMinor?: number | null;
  expectBack: boolean;
  withWhom?: string | null;
}

export type SetShareResult = { ok: true; share: ShareView } | { ok: false; error: string; status: number };

/** Mark a purchase as split, or change how. Only purchases can be split. */
export async function setShare(scope: Scope, transactionId: string, input: ShareInput): Promise<SetShareResult> {
  const found = await withUser(scope.userId, (tx) => tx.select({ type: transactions.type, base: transactions.baseAmountMinor })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.workspaceId, scope.workspaceId), isNull(transactions.deletedAt)))
    .limit(1));
  const txn = found[0];
  if (!txn) return { ok: false, error: 'That transaction could not be found.', status: 404 };
  if (txn.type !== 'expense') return { ok: false, error: 'Only purchases can be split.', status: 400 };

  const total = absMinor(n(txn.base));
  const people = input.kind === 'split' ? Math.max(2, Math.min(50, Math.round(input.people ?? 2))) : null;
  let mine: bigint | null = null;
  if (input.kind === 'split' && input.mineMinor !== null && input.mineMinor !== undefined) {
    mine = BigInt(Math.round(input.mineMinor));
    if (mine < 0n || mine > total) return { ok: false, error: 'Your part can’t be more than the purchase.', status: 400 };
  }
  const withWhom = input.withWhom?.trim().slice(0, 200) || null;
  const values = { kind: input.kind, people, mineMinor: mine, expectBack: input.expectBack, withWhom, updatedAt: new Date() };

  await withUser(scope.userId, (tx) => tx.insert(costShares)
    .values({ ...values, workspaceId: scope.workspaceId, transactionId, createdBy: scope.userId })
    .onConflictDoUpdate({ target: costShares.transactionId, set: values }));

  const share = await shareForTransaction(scope, transactionId);
  await syncSettled(scope, share);
  return { ok: true, share: (await shareForTransaction(scope, transactionId))! };
}

/** No longer split: the whole purchase is yours again. Paybacks recorded against it go too. */
export async function clearShare(scope: Scope, transactionId: string): Promise<void> {
  await withUser(scope.userId, (tx) => tx.delete(costShares)
    .where(and(eq(costShares.workspaceId, scope.workspaceId), eq(costShares.transactionId, transactionId))));
}

export type PaybackResult = { ok: true; share: ShareView } | { ok: false; error: string; status: number };

/**
 * Money came back. With a deposit linked, that deposit stops counting as income.
 * Without an amount, it is whatever is still owed ("they paid me back").
 */
export async function recordPayback(scope: Scope, shareId: string, input: { amountMinor?: number | null; transactionId?: string | null; receivedOn?: string | null; person?: string | null }): Promise<PaybackResult> {
  const rows = await withUser(scope.userId, (tx) => tx.select({ transactionId: costShares.transactionId })
    .from(costShares).where(and(eq(costShares.id, shareId), eq(costShares.workspaceId, scope.workspaceId))).limit(1));
  if (!rows[0]) return { ok: false, error: 'That split could not be found.', status: 404 };
  const before = await shareForTransaction(scope, rows[0].transactionId);
  if (!before) return { ok: false, error: 'That split could not be found.', status: 404 };
  if (!before.expectBack) return { ok: false, error: 'This one isn’t marked as coming back.', status: 400 };

  let receivedOn = input.receivedOn && /^\d{4}-\d{2}-\d{2}$/.test(input.receivedOn) ? input.receivedOn : new Date().toISOString().slice(0, 10);
  let amount = input.amountMinor ?? null;

  if (input.transactionId) {
    // The deposit must be money in, in this workspace, not already a payback.
    const dep = await withUser(scope.userId, (tx) => tx.select({ type: transactions.type, base: transactions.baseAmountMinor, date: transactions.postedDate })
      .from(transactions)
      .where(and(eq(transactions.id, input.transactionId!), eq(transactions.workspaceId, scope.workspaceId), isNull(transactions.deletedAt)))
      .limit(1));
    if (!dep[0] || dep[0].type !== 'income') return { ok: false, error: 'Pick a deposit that came in.', status: 400 };
    const taken = await withUser(scope.userId, (tx) => tx.select({ id: costRepayments.id }).from(costRepayments)
      .where(eq(costRepayments.transactionId, input.transactionId!)).limit(1));
    if (taken[0]) return { ok: false, error: 'That deposit is already counted as a payback.', status: 409 };
    const deposit = Number(absMinor(n(dep[0].base)));
    // A deposit bigger than what is owed (a payroll picked by mistake, or a friend
    // rounding up) only counts for what is owed; the rest stays income.
    amount ??= Math.min(deposit, before.owedMinor);
    if (amount > deposit) return { ok: false, error: 'That’s more than the deposit.', status: 400 };
    receivedOn = dep[0].date;
  }

  if (before.owedMinor === 0) return { ok: false, error: 'This one is already squared up.', status: 400 };
  amount ??= before.owedMinor;
  amount = Math.round(amount);
  if (!(amount > 0)) return { ok: false, error: 'Enter how much came back.', status: 400 };
  if (amount > before.owedMinor) return { ok: false, error: `Only ${(before.owedMinor / 100).toFixed(2)} is still owed on this one.`, status: 400 };

  await withUser(scope.userId, (tx) => tx.insert(costRepayments).values({
    workspaceId: scope.workspaceId, costShareId: shareId, transactionId: input.transactionId ?? null,
    amountMinor: BigInt(amount!), receivedOn, person: input.person?.trim().slice(0, 80) || null,
  }));
  const after = await shareForTransaction(scope, rows[0].transactionId);
  await syncSettled(scope, after);
  return { ok: true, share: after! };
}

/** Undo a payback recorded by mistake. */
export async function removePayback(scope: Scope, shareId: string, repaymentId: string): Promise<ShareView | null> {
  const rows = await withUser(scope.userId, async (tx) => {
    await tx.delete(costRepayments).where(and(
      eq(costRepayments.id, repaymentId), eq(costRepayments.costShareId, shareId), eq(costRepayments.workspaceId, scope.workspaceId),
    ));
    return tx.select({ transactionId: costShares.transactionId }).from(costShares)
      .where(and(eq(costShares.id, shareId), eq(costShares.workspaceId, scope.workspaceId))).limit(1);
  });
  if (!rows[0]) return null;
  const share = await shareForTransaction(scope, rows[0].transactionId);
  await syncSettled(scope, share);
  return shareForTransaction(scope, rows[0].transactionId);
}

/** Keep settled_at in step with the money, so "squared up" can be listed cheaply. */
async function syncSettled(scope: Scope, share: ShareView | null) {
  if (!share) return;
  await withUser(scope.userId, (tx) => tx.update(costShares)
    .set({ settledAt: share.settled ? dsql`coalesce(${costShares.settledAt}, now())` : null })
    .where(and(eq(costShares.id, share.id), eq(costShares.workspaceId, scope.workspaceId))));
}

/** Recent money in that could be a payback: deposits not already linked to one. */
export async function candidateDeposits(scope: Scope, sinceIso: string) {
  return withUser(scope.userId, async (tx) => {
    const rows = await tx.select({ id: transactions.id, description: transactions.description, merchantName: transactions.merchantName, date: transactions.postedDate, base: transactions.baseAmountMinor })
      .from(transactions)
      .where(and(
        eq(transactions.workspaceId, scope.workspaceId), isNull(transactions.deletedAt),
        eq(transactions.type, 'income'), gte(transactions.postedDate, sinceIso),
        dsql`NOT EXISTS (SELECT 1 FROM pockit.cost_repayments r WHERE r.transaction_id = ${transactions.id})`,
      ))
      .orderBy(desc(transactions.postedDate))
      .limit(30);
    return rows.map((r) => ({ id: r.id, name: r.merchantName ?? r.description, date: r.date, amountMinor: Number(absMinor(n(r.base))) }));
  });
}

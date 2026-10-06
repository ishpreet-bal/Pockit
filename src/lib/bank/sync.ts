import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { accounts, bankConnections, categories, transactions } from '@/lib/db/schema';
import { accountType, categorySlug, isLiability, signedMinor, txType, type PlaidAccount, type PlaidTxn } from './map';
import { getAccounts, openToken, syncTransactions, PlaidError } from './plaid';

/**
 * Bring one bank connection up to date: its accounts (and balances), then every
 * transaction added, changed or removed since the last sync.
 *
 * Balances: the bank's current balance becomes the account's opening balance
 * dated tomorrow — the same rule as a balance typed by hand — so the bank's
 * number is the truth and today's transactions aren't counted twice.
 * Pending transactions are skipped until they post.
 */

interface Ctx { userId: string; workspaceId: string; currency: string }
export interface SyncResult { accounts: number; added: number; updated: number; removed: number }

export async function syncConnection(ctx: Ctx, connectionId: string): Promise<SyncResult> {
  const conn = (await withUser(ctx.userId, (tx) => tx.select().from(bankConnections)
    .where(and(eq(bankConnections.id, connectionId), eq(bankConnections.workspaceId, ctx.workspaceId))).limit(1)))[0];
  if (!conn) throw new Error('Connection not found');
  const access = openToken(conn.accessTokenEnc);
  try {
    const [acc, delta] = await Promise.all([getAccounts(access), syncTransactions(access, conn.cursor)]);
    const result = await applySync(ctx, conn.id, conn.institutionName, acc.accounts, delta);
    await withUser(ctx.userId, (tx) => tx.update(bankConnections).set({ cursor: delta.cursor, lastSyncedAt: new Date(), status: 'active', error: null }).where(eq(bankConnections.id, conn.id)));
    return result;
  } catch (e) {
    // ITEM_LOGIN_REQUIRED and friends: the person has to sign in to their bank again.
    const needsLogin = e instanceof PlaidError && /LOGIN|EXPIRED|PENDING_EXPIRATION|INVALID_CREDENTIALS/.test(e.code ?? '');
    await withUser(ctx.userId, (tx) => tx.update(bankConnections).set({ status: needsLogin ? 'reconnect' : 'error', error: e instanceof Error ? e.message.slice(0, 300) : 'Sync failed' }).where(eq(bankConnections.id, conn.id)));
    throw e;
  }
}

export async function applySync(
  ctx: Ctx, connectionId: string, institution: string | null, plaidAccounts: PlaidAccount[],
  delta: { added: PlaidTxn[]; modified: PlaidTxn[]; removed: { transaction_id: string }[] },
): Promise<SyncResult> {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return withUser(ctx.userId, async (tx) => {
    // 1. Accounts: match on Plaid's id, create the ones we haven't seen.
    const existing = await tx.select({ id: accounts.id, externalId: accounts.externalId, type: accounts.type }).from(accounts)
      .where(and(eq(accounts.workspaceId, ctx.workspaceId), eq(accounts.externalProvider, `plaid:${connectionId}`)));
    const byPlaid = new Map(existing.map((a) => [a.externalId!, { id: a.id, type: a.type as ReturnType<typeof accountType> }]));
    for (const a of plaidAccounts) {
      const type = accountType(a);
      const balance = { openingBalanceMinor: BigInt(Math.round((a.balances.current ?? 0) * 100)), openingBalanceDate: tomorrow, lastSyncedAt: new Date() };
      const known = byPlaid.get(a.account_id);
      if (known) { await tx.update(accounts).set(balance).where(eq(accounts.id, known.id)); continue; }
      const made = await tx.insert(accounts).values({
        workspaceId: ctx.workspaceId,
        name: institution ? `${institution} ${a.name}` : a.name,
        type, normalBalance: isLiability(type) ? 'credit' : 'debit',
        currency: a.balances.iso_currency_code ?? ctx.currency,
        institution, mask: a.mask ?? null,
        externalProvider: `plaid:${connectionId}`, externalId: a.account_id,
        ...balance,
      }).returning({ id: accounts.id });
      byPlaid.set(a.account_id, { id: made[0]!.id, type });
    }

    // 2. Categories by slug, for Plaid's category guesses.
    const cats = await tx.select({ id: categories.id, slug: categories.slug }).from(categories).where(eq(categories.workspaceId, ctx.workspaceId));
    const catBySlug = new Map(cats.map((c) => [c.slug, c.id]));

    // 3. Added: skip pending and anything already stored.
    const posted = delta.added.filter((t) => !t.pending && byPlaid.has(t.account_id));
    const seen = posted.length
      ? new Set((await tx.select({ e: transactions.externalId }).from(transactions)
          .where(and(eq(transactions.workspaceId, ctx.workspaceId), inArray(transactions.externalId, posted.map((t) => t.transaction_id))))).map((r) => r.e))
      : new Set<string | null>();
    let added = 0;
    for (const t of posted) {
      if (seen.has(t.transaction_id)) continue;
      const acct = byPlaid.get(t.account_id)!;
      const amount = signedMinor(t, acct.type);
      const slug = categorySlug(t);
      await tx.insert(transactions).values({
        workspaceId: ctx.workspaceId, accountId: acct.id, postedDate: t.date,
        description: t.merchant_name || t.name, originalDescription: t.name, merchantName: t.merchant_name ?? null,
        amountMinor: amount, currency: t.iso_currency_code ?? ctx.currency, baseAmountMinor: amount, baseCurrency: ctx.currency,
        type: txType(t, acct.type), categoryId: slug ? catBySlug.get(slug) ?? null : null,
        source: 'api', externalId: t.transaction_id, createdBy: ctx.userId,
        provenance: { provider: 'plaid', category: t.personal_finance_category ?? null },
      });
      added++;
    }

    // 4. Modified: the bank corrected an amount, date or name.
    let updated = 0;
    for (const t of delta.modified) {
      const acct = byPlaid.get(t.account_id);
      if (!acct || t.pending) continue;
      const amount = signedMinor(t, acct.type);
      const r = await tx.update(transactions).set({ postedDate: t.date, description: t.merchant_name || t.name, amountMinor: amount, baseAmountMinor: amount, updatedAt: new Date() })
        .where(and(eq(transactions.workspaceId, ctx.workspaceId), eq(transactions.externalId, t.transaction_id))).returning({ id: transactions.id });
      updated += r.length;
    }

    // 5. Removed: hide, don't erase — the audit trail keeps it.
    let removed = 0;
    if (delta.removed.length) {
      const r = await tx.update(transactions).set({ deletedAt: new Date() })
        .where(and(eq(transactions.workspaceId, ctx.workspaceId), inArray(transactions.externalId, delta.removed.map((x) => x.transaction_id)))).returning({ id: transactions.id });
      removed = r.length;
    }
    return { accounts: plaidAccounts.length, added, updated, removed };
  });
}

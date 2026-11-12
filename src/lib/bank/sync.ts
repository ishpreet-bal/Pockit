import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { withUser } from '@/lib/db/client';
import { accounts, bankConnections, categories, merchantRules, transactions } from '@/lib/db/schema';
import { matchesRule, resolveMerchant } from '@/lib/import/normalize';
import { accountType, categorySlug, isLiability, signedMinor, txType, type PlaidAccount, type PlaidTxn, type TxType } from './map';
import { getAccounts, getCardStatements, openToken, syncTransactions, PlaidError, TokenUnreadable, type PlaidCardStatement } from './plaid';

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
  try {
    // Inside the try: a token that can't be opened (AUTH_SECRET changed) must mark
    // the bank as needing a reconnect, not fail silently every day.
    const access = openToken(conn.accessTokenEnc, conn.workspaceId);
    const [acc, delta, cards] = await Promise.all([getAccounts(access), syncTransactions(access, conn.cursor), getCardStatements(access)]);
    const result = await applySync(ctx, conn.id, conn.institutionName, acc.accounts, delta);
    if (cards?.length) await applyCardStatements(ctx, conn.id, cards);
    await withUser(ctx.userId, (tx) => tx.update(bankConnections).set({ cursor: delta.cursor, lastSyncedAt: new Date(), status: 'active', error: null }).where(eq(bankConnections.id, conn.id)));
    return result;
  } catch (e) {
    // ITEM_LOGIN_REQUIRED and friends: the person has to sign in to their bank again.
    const needsLogin = (e instanceof PlaidError && /LOGIN|EXPIRED|PENDING_EXPIRATION|INVALID_CREDENTIALS|INVALID_ACCESS_TOKEN/.test(e.code ?? '')) || e instanceof TokenUnreadable;
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

    // 2. What decides a category: the person's own rules (what "remember this" saved),
    //    then Pockit's list of known merchants, then Plaid's guess.
    const cats = await tx.select({ id: categories.id, slug: categories.slug, kind: categories.kind }).from(categories)
      .where(and(eq(categories.workspaceId, ctx.workspaceId), eq(categories.isArchived, false)));
    const rules = await tx.select({ pattern: merchantRules.pattern, matchType: merchantRules.matchType, categoryId: merchantRules.categoryId, id: merchantRules.id })
      .from(merchantRules).where(and(eq(merchantRules.workspaceId, ctx.workspaceId), eq(merchantRules.isActive, true))).orderBy(merchantRules.priority);
    const categorize = categorizer(cats, rules);

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
      const type = txType({ ...t, name: `${t.name} ${t.merchant_name ?? ''}` }, acct.type);
      const merchant = resolveMerchant(t.name, t.merchant_name);
      const pick = categorize(t, type, merchant.categorySlug);
      await tx.insert(transactions).values({
        workspaceId: ctx.workspaceId, accountId: acct.id, postedDate: t.date,
        description: t.merchant_name || merchant.displayName || t.name, originalDescription: t.name, merchantName: t.merchant_name ?? merchant.displayName ?? null,
        amountMinor: amount, currency: t.iso_currency_code ?? ctx.currency, baseAmountMinor: amount, baseCurrency: ctx.currency,
        type, categoryId: pick.categoryId,
        source: 'api', externalId: t.transaction_id, createdBy: ctx.userId,
        provenance: { provider: 'plaid', category: t.personal_finance_category ?? null, categorizedBy: pick.by },
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

/** Each card's statement onto its account: when it's due, how much, and the minimum. */
export async function applyCardStatements(ctx: Ctx, connectionId: string, cards: PlaidCardStatement[]): Promise<number> {
  const minor = (v: number | null | undefined) => (v === null || v === undefined ? null : BigInt(Math.round(v * 100)));
  return withUser(ctx.userId, async (tx) => {
    let n = 0;
    for (const c of cards) {
      if (!c.account_id) continue;
      const purchase = c.aprs?.find((a) => a.apr_type === 'purchase_apr');
      const r = await tx.update(accounts).set({
        paymentDueDate: c.next_payment_due_date ?? null,
        paymentDueDay: c.next_payment_due_date ? Number(c.next_payment_due_date.slice(8, 10)) : undefined,
        statementBalanceMinor: minor(c.last_statement_balance),
        minimumPaymentMinor: minor(c.minimum_payment_amount),
        lastPaymentDate: c.last_payment_date ?? null,
        lastStatementDate: c.last_statement_issue_date ?? null,
        ...(purchase ? { interestRateBps: Math.round(purchase.apr_percentage * 100) } : {}),
        updatedAt: new Date(),
      }).where(and(eq(accounts.workspaceId, ctx.workspaceId), eq(accounts.externalProvider, `plaid:${connectionId}`), eq(accounts.externalId, c.account_id)))
        .returning({ id: accounts.id });
      n += r.length;
    }
    return n;
  });
}

type Cat = { id: string; slug: string; kind: string };
type Rule = { id: string; pattern: string; matchType: string; categoryId: string | null };

/**
 * Picks a category for one bank transaction. Exported for tests.
 *
 * A category must suit the kind of money: pay never lands in Groceries because a
 * grocery chain paid you, and a purchase never lands in Salary. Transfers between
 * your own accounts get Transfer, so they never count as spending or income.
 */
export function categorizer(cats: Cat[], rules: Rule[]) {
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const byId = new Map(cats.map((c) => [c.id, c]));
  const fits = (c: Cat | undefined, type: TxType) => {
    if (!c) return false;
    if (type === 'transfer' || type === 'debt_payment') return c.kind === 'transfer' || c.slug === 'debt-payments';
    if (type === 'income') return c.kind === 'income';
    return c.kind === 'expense';
  };
  return (t: Pick<PlaidTxn, 'name' | 'merchant_name' | 'personal_finance_category'>, type: TxType, lexiconSlug: string | null): { categoryId: string | null; by: 'rule' | 'merchant' | 'bank' | null } => {
    const haystack = `${t.name} ${t.merchant_name ?? ''}`.toLowerCase();
    for (const r of rules) {
      if (!r.categoryId || !matchesRule(haystack, r.pattern.toLowerCase(), r.matchType)) continue;
      const c = byId.get(r.categoryId);
      // A refund back to a card is still that shop's category.
      if (c && (fits(c, type) || (type === 'refund' && c.kind === 'expense'))) return { categoryId: c.id, by: 'rule' };
    }
    if (type === 'transfer') { const c = bySlug.get('transfer'); return { categoryId: c?.id ?? null, by: c ? 'bank' : null }; }
    const want = (slug: string | null) => { const c = slug ? bySlug.get(slug) : undefined; return c && (fits(c, type) || (type === 'refund' && c.kind === 'expense')) ? c : undefined; };
    const fromMerchant = want(lexiconSlug);
    if (fromMerchant) return { categoryId: fromMerchant.id, by: 'merchant' };
    const fromBank = want(categorySlug(t));
    if (fromBank) return { categoryId: fromBank.id, by: 'bank' };
    if (type === 'income') { const c = bySlug.get('other-income'); if (c) return { categoryId: c.id, by: 'bank' }; }
    return { categoryId: null, by: null };
  };
}

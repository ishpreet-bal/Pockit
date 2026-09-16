import 'server-only';
import { and, eq, isNull, desc, sql as dsql, inArray, gte, lte } from 'drizzle-orm';
import { withUser, type Db } from '@/lib/db/client';
import {
  accounts, categories, transactions, transactionSplits, budgets, budgetAllocations,
  goals, recurringSeries, workspaces, workspaceMembers, merchants, merchantRules,
  assets as assetsTable, liabilities as liabilitiesTable, holdings, debts, imports,
} from '@/lib/db/schema';
import { minorFromDb } from '@/lib/money';
import type {
  LedgerTxn, LedgerAccount, LedgerCategory, DateRange, IsoDate, BusinessClass, TxnType,
} from '@/lib/finance/types';
import type { ManualSchedule } from '@/lib/finance/schedule';

/**
 * Every read and write goes through a workspace-scoped repository.
 *
 * The scope is applied here, once, rather than remembered by each caller — a page
 * cannot forget to add `WHERE workspace_id = ?` because it never writes the query.
 * Postgres RLS (migration 0001) is the second, independent layer.
 */
export class WorkspaceRepo {
  constructor(
    readonly userId: string,
    readonly workspaceId: string,
    readonly baseCurrency: string,
  ) {}

  private run<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return withUser(this.userId, fn);
  }

  /** Confirms membership. Called before any mutation that names a workspace. */
  async assertMembership(): Promise<void> {
    const rows = await this.run((tx) =>
      tx.select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, this.workspaceId), eq(workspaceMembers.userId, this.userId)))
        .limit(1),
    );
    if (rows.length === 0) throw new Error('Not a member of this workspace');
  }

  /* ---------------- accounts ---------------- */

  async listAccounts(): Promise<LedgerAccount[]> {
    const rows = await this.run((tx) =>
      tx.select().from(accounts)
        .where(and(eq(accounts.workspaceId, this.workspaceId), isNull(accounts.deletedAt)))
        .orderBy(accounts.sortOrder, accounts.name),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      normalBalance: r.normalBalance,
      currency: r.currency,
      openingBalanceMinor: minorFromDb(r.openingBalanceMinor as unknown as string),
      openingBalanceDate: r.openingBalanceDate,
      creditLimitMinor: r.creditLimitMinor === null ? null : minorFromDb(r.creditLimitMinor as unknown as string),
      isActive: r.isActive,
      excludeFromNetWorth: r.excludeFromNetWorth,
    }));
  }

  async listAccountsRaw() {
    return this.run((tx) =>
      tx.select().from(accounts)
        .where(and(eq(accounts.workspaceId, this.workspaceId), isNull(accounts.deletedAt)))
        .orderBy(accounts.sortOrder, accounts.name),
    );
  }

  /* ---------------- categories ---------------- */

  async listCategories(): Promise<LedgerCategory[]> {
    const rows = await this.run((tx) =>
      tx.select().from(categories)
        .where(and(eq(categories.workspaceId, this.workspaceId), eq(categories.isArchived, false)))
        .orderBy(categories.sortOrder, categories.name),
    );
    return rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      name: r.name,
      slug: r.slug,
      kind: r.kind,
      classification: r.classification,
      necessity: r.necessity,
      color: r.color,
      icon: r.icon,
    }));
  }

  /* ---------------- transactions ---------------- */

  async listTransactions(options: {
    range?: DateRange;
    limit?: number;
    offset?: number;
    includeSplits?: boolean;
  } = {}): Promise<LedgerTxn[]> {
    const { range, limit, offset = 0, includeSplits = true } = options;

    const rows = await this.run(async (tx) => {
      const conditions = [eq(transactions.workspaceId, this.workspaceId), isNull(transactions.deletedAt)];
      if (range) {
        conditions.push(gte(transactions.postedDate, range.start));
        conditions.push(lte(transactions.postedDate, range.end));
      }
      const q = tx.select().from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.postedDate), desc(transactions.createdAt));
      return limit ? q.limit(limit).offset(offset) : q;
    });

    const mapped: LedgerTxn[] = rows.map((r) => ({
      id: r.id,
      accountId: r.accountId,
      postedDate: r.postedDate,
      description: r.description,
      merchantName: r.merchantName,
      merchantId: r.merchantId,
      amountMinor: minorFromDb(r.amountMinor as unknown as string),
      baseAmountMinor: minorFromDb(r.baseAmountMinor as unknown as string),
      currency: r.currency,
      type: r.type,
      categoryId: r.categoryId,
      businessClassification: r.businessClassification,
      isRecurring: r.isRecurring,
      recurringSeriesId: r.recurringSeriesId,
      transferGroupId: r.transferGroupId,
      offsetsTransactionId: r.offsetsTransactionId,
    }));

    if (includeSplits && mapped.length > 0) {
      const ids = mapped.map((m) => m.id);
      const splitRows = await this.run((tx) =>
        tx.select().from(transactionSplits)
          .where(and(eq(transactionSplits.workspaceId, this.workspaceId), inArray(transactionSplits.transactionId, ids))),
      );
      if (splitRows.length > 0) {
        const byTxn = new Map<string, LedgerTxn['splits']>();
        for (const s of splitRows) {
          const list = byTxn.get(s.transactionId) ?? [];
          list.push({
            categoryId: s.categoryId,
            businessClassification: s.businessClassification,
            amountMinor: minorFromDb(s.amountMinor as unknown as string),
          });
          byTxn.set(s.transactionId, list);
        }
        for (const m of mapped) m.splits = byTxn.get(m.id);
      }
    }

    return mapped;
  }

  async countTransactions(range?: DateRange): Promise<number> {
    const rows = await this.run((tx) => {
      const conditions = [eq(transactions.workspaceId, this.workspaceId), isNull(transactions.deletedAt)];
      if (range) {
        conditions.push(gte(transactions.postedDate, range.start));
        conditions.push(lte(transactions.postedDate, range.end));
      }
      return tx.select({ n: dsql<string>`count(*)` }).from(transactions).where(and(...conditions));
    });
    return Number(rows[0]?.n ?? 0);
  }

  async insertTransaction(input: {
    accountId: string;
    postedDate: IsoDate;
    description: string;
    originalDescription?: string | null;
    merchantName?: string | null;
    amountMinor: bigint;
    currency: string;
    baseAmountMinor: bigint;
    type: TxnType;
    categoryId?: string | null;
    businessClassification?: BusinessClass;
    notes?: string | null;
    source?: string;
    importId?: string | null;
    transferGroupId?: string | null;
    isRecurring?: boolean;
    aiConfidence?: number | null;
    needsReview?: boolean;
    provenance?: unknown;
  }): Promise<string> {
    const rows = await this.run((tx) =>
      tx.insert(transactions).values({
        workspaceId: this.workspaceId,
        accountId: input.accountId,
        postedDate: input.postedDate,
        description: input.description,
        originalDescription: input.originalDescription ?? null,
        merchantName: input.merchantName ?? null,
        amountMinor: input.amountMinor,
        currency: input.currency,
        baseAmountMinor: input.baseAmountMinor,
        baseCurrency: this.baseCurrency,
        type: input.type,
        categoryId: input.categoryId ?? null,
        businessClassification: input.businessClassification ?? 'personal',
        notes: input.notes ?? null,
        source: (input.source ?? 'manual') as 'manual',
        importId: input.importId ?? null,
        transferGroupId: input.transferGroupId ?? null,
        isRecurring: input.isRecurring ?? false,
        aiConfidence: input.aiConfidence ?? null,
        needsReview: input.needsReview ?? false,
        provenance: input.provenance ?? null,
        createdBy: this.userId,
      }).returning({ id: transactions.id }),
    );
    return rows[0]!.id;
  }

  async softDeleteTransaction(id: string): Promise<void> {
    await this.run((tx) =>
      tx.update(transactions).set({ deletedAt: new Date() })
        .where(and(eq(transactions.id, id), eq(transactions.workspaceId, this.workspaceId))),
    );
  }

  /* ---------------- planning ---------------- */

  async listGoals() {
    return this.run((tx) =>
      tx.select().from(goals)
        .where(eq(goals.workspaceId, this.workspaceId))
        .orderBy(goals.priority, goals.createdAt),
    );
  }

  async getActiveBudget() {
    const rows = await this.run((tx) =>
      tx.select().from(budgets)
        .where(and(eq(budgets.workspaceId, this.workspaceId), eq(budgets.isActive, true)))
        .orderBy(desc(budgets.createdAt)).limit(1),
    );
    const budget = rows[0];
    if (!budget) return null;
    const allocations = await this.run((tx) =>
      tx.select().from(budgetAllocations)
        .where(eq(budgetAllocations.budgetId, budget.id))
        .orderBy(budgetAllocations.sortOrder),
    );
    return { budget, allocations };
  }

  /** Manual schedules, in the shape the finance engine consumes. */
  async listManualSchedules(): Promise<ManualSchedule[]> {
    const rows = await this.run((tx) =>
      tx.select().from(recurringSeries).where(and(
        eq(recurringSeries.workspaceId, this.workspaceId),
        eq(recurringSeries.isManual, true),
      )).orderBy(recurringSeries.name),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      amountMinor: minorFromDb(r.amountMinor as unknown as string),
      currency: r.currency,
      cadence: r.cadence,
      interval: r.intervalCount,
      dayOfMonth: r.dayOfMonth,
      startDate: r.startDate ?? r.nextExpectedDate ?? new Date().toISOString().slice(0, 10),
      endDate: r.endDate,
      type: r.type,
      categoryId: r.categoryId,
      accountId: r.accountId,
      direction: r.direction === 'inflow' ? 'inflow' : 'outflow',
      isActive: r.status === 'active',
    }));
  }

  async listRecurringSeries() {
    return this.run((tx) =>
      tx.select().from(recurringSeries)
        .where(eq(recurringSeries.workspaceId, this.workspaceId))
        .orderBy(recurringSeries.nextExpectedDate),
    );
  }

  async listAssets() {
    return this.run((tx) => tx.select().from(assetsTable).where(eq(assetsTable.workspaceId, this.workspaceId)));
  }

  async listLiabilities() {
    return this.run((tx) => tx.select().from(liabilitiesTable).where(eq(liabilitiesTable.workspaceId, this.workspaceId)));
  }

  async listHoldings() {
    return this.run((tx) => tx.select().from(holdings).where(eq(holdings.workspaceId, this.workspaceId)));
  }

  async listDebts() {
    return this.run((tx) =>
      tx.select().from(debts)
        .where(and(eq(debts.workspaceId, this.workspaceId), eq(debts.isActive, true)))
        .orderBy(debts.strategyOrder),
    );
  }

  async listImports() {
    return this.run((tx) =>
      tx.select().from(imports)
        .where(eq(imports.workspaceId, this.workspaceId))
        .orderBy(desc(imports.createdAt)).limit(50),
    );
  }

  async listMerchantRules() {
    return this.run((tx) =>
      tx.select().from(merchantRules)
        .where(and(eq(merchantRules.workspaceId, this.workspaceId), eq(merchantRules.isActive, true)))
        .orderBy(merchantRules.priority),
    );
  }

  async upsertMerchant(name: string, normalized: string, categoryId: string | null): Promise<string> {
    const existing = await this.run((tx) =>
      tx.select({ id: merchants.id }).from(merchants)
        .where(and(eq(merchants.workspaceId, this.workspaceId), eq(merchants.normalizedName, normalized)))
        .limit(1),
    );
    if (existing[0]) return existing[0].id;
    const rows = await this.run((tx) =>
      tx.insert(merchants).values({
        workspaceId: this.workspaceId, name, normalizedName: normalized, defaultCategoryId: categoryId,
      }).returning({ id: merchants.id }),
    );
    return rows[0]!.id;
  }

  async getWorkspace() {
    const rows = await this.run((tx) =>
      tx.select().from(workspaces).where(eq(workspaces.id, this.workspaceId)).limit(1),
    );
    return rows[0] ?? null;
  }
}

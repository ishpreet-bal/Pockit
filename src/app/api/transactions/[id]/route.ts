import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and, isNull } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { transactions, merchantRules } from '@/lib/db/schema';
import { WorkspaceRepo } from '@/lib/data/repository';
import { parseMoney, absMinor, MoneyParseError } from '@/lib/money';
import { normalizeMerchant } from '@/lib/finance/duplicates';
import { audit } from '@/lib/auth/session';

const patchSchema = z.object({
  postedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().trim().min(1).max(300).optional(),
  amount: z.string().min(1).optional(),
  type: z.enum(['expense', 'income', 'transfer', 'refund', 'investment', 'debt_payment']).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().optional(),
  businessClassification: z.enum(['personal', 'business']).optional(),
  notes: z.string().max(2000).nullable().optional(),
  isRecurring: z.boolean().optional(),
  /** Remember this category for this merchant in future (spec: learn my choices). */
  rememberCategory: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const input = parsed.data;

  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const accounts = await repo.listAccounts();

  const existing = await withUser(ctx.user.id, (tx) =>
    tx.select().from(transactions).where(and(
      eq(transactions.id, id),
      eq(transactions.workspaceId, ctx.workspace.id),
      isNull(transactions.deletedAt),
    )).limit(1),
  );
  const current = existing[0];
  if (!current) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

  const account = accounts.find((a) => a.id === (input.accountId ?? current.accountId));
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const values: Record<string, unknown> = {};
  if (input.postedDate) values.postedDate = input.postedDate;
  if (input.description) { values.description = input.description; values.merchantName = input.description; }
  if (input.categoryId !== undefined) values.categoryId = input.categoryId;
  if (input.accountId) values.accountId = input.accountId;
  if (input.businessClassification) values.businessClassification = input.businessClassification;
  if (input.notes !== undefined) values.notes = input.notes;
  if (input.isRecurring !== undefined) values.isRecurring = input.isRecurring;

  const nextType = input.type ?? current.type;
  if (input.type) values.type = input.type;

  // Re-sign whenever the amount, the type or the account changes, since all three
  // determine the direction the amount must be stored in.
  if (input.amount !== undefined || input.type || input.accountId) {
    let magnitude: bigint;
    if (input.amount !== undefined) {
      try {
        const value = parseMoney(input.amount, account.currency);
        if (value === null) return NextResponse.json({ error: 'Enter an amount' }, { status: 400 });
        magnitude = absMinor(value);
      } catch (error) {
        if (error instanceof MoneyParseError) {
          return NextResponse.json({ error: 'That amount could not be read' }, { status: 400 });
        }
        throw error;
      }
    } else {
      magnitude = absMinor(BigInt(current.amountMinor as unknown as string));
    }
    if (magnitude === 0n) return NextResponse.json({ error: 'Amount must not be zero' }, { status: 400 });

    const increasesAccount =
      nextType === 'income' || nextType === 'refund'
        ? account.normalBalance === 'debit'
        : account.normalBalance === 'credit';
    const signed = increasesAccount ? magnitude : -magnitude;
    values.amountMinor = signed;
    values.baseAmountMinor = signed;
  }

  if (Object.keys(values).length === 0) return NextResponse.json({ ok: true, id });

  await withUser(ctx.user.id, (tx) =>
    tx.update(transactions).set(values).where(and(
      eq(transactions.id, id),
      eq(transactions.workspaceId, ctx.workspace.id),
    )),
  );

  // Correcting a category is the clearest possible signal of intent, so it becomes a
  // visible rule rather than hidden model state.
  if (input.rememberCategory && input.categoryId) {
    const pattern = normalizeMerchant(input.description ?? current.merchantName ?? current.description);
    if (pattern.length >= 3) {
      await withUser(ctx.user.id, async (tx) => {
        const existingRule = await tx.select({ id: merchantRules.id }).from(merchantRules).where(and(
          eq(merchantRules.workspaceId, ctx.workspace.id),
          eq(merchantRules.pattern, pattern),
        )).limit(1);
        if (existingRule[0]) {
          await tx.update(merchantRules)
            .set({ categoryId: input.categoryId, isActive: true })
            .where(eq(merchantRules.id, existingRule[0].id));
        } else {
          await tx.insert(merchantRules).values({
            workspaceId: ctx.workspace.id,
            matchType: 'contains',
            pattern,
            categoryId: input.categoryId,
            source: 'learned',
            priority: 150,
          });
        }
      });
    }
  }

  await audit({
    actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
    action: 'transaction.update', entity: 'transaction', entityId: id,
    metadata: { fields: Object.keys(values) },
  });

  return NextResponse.json({ ok: true, id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;

  // Soft delete: the row leaves every view and every total, but an accidental
  // deletion is recoverable rather than final.
  const removed = await withUser(ctx.user.id, (tx) =>
    tx.update(transactions).set({ deletedAt: new Date() }).where(and(
      eq(transactions.id, id),
      eq(transactions.workspaceId, ctx.workspace.id),
      isNull(transactions.deletedAt),
    )).returning({ id: transactions.id }),
  );

  if (removed.length === 0) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

  await audit({
    actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
    action: 'transaction.delete', entity: 'transaction', entityId: id,
  });

  return NextResponse.json({ ok: true });
}

/** Duplicate a transaction — the fastest way to enter something that repeats irregularly. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;

  const rows = await withUser(ctx.user.id, (tx) =>
    tx.select().from(transactions).where(and(
      eq(transactions.id, id),
      eq(transactions.workspaceId, ctx.workspace.id),
      isNull(transactions.deletedAt),
    )).limit(1),
  );
  const source = rows[0];
  if (!source) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

  const created = await withUser(ctx.user.id, (tx) =>
    tx.insert(transactions).values({
      workspaceId: source.workspaceId,
      accountId: source.accountId,
      postedDate: source.postedDate,
      description: source.description,
      originalDescription: source.originalDescription,
      merchantName: source.merchantName,
      merchantId: source.merchantId,
      amountMinor: BigInt(source.amountMinor as unknown as string),
      currency: source.currency,
      baseAmountMinor: BigInt(source.baseAmountMinor as unknown as string),
      baseCurrency: source.baseCurrency,
      type: source.type,
      categoryId: source.categoryId,
      businessClassification: source.businessClassification,
      notes: source.notes,
      source: 'manual',
      createdBy: ctx.user.id,
    }).returning({ id: transactions.id }),
  );

  return NextResponse.json({ ok: true, id: created[0]!.id });
}

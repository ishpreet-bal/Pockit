import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { WorkspaceRepo } from '@/lib/data/repository';
import { parseMoney, absMinor, MoneyParseError } from '@/lib/money';
import { normalizeMerchant } from '@/lib/finance/duplicates';
import { audit } from '@/lib/auth/session';

const schema = z.object({
  amount: z.string().min(1),
  description: z.string().trim().min(1).max(300),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  postedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['expense', 'income', 'transfer', 'refund', 'investment', 'debt_payment']),
  businessClassification: z.enum(['personal', 'business']).default('personal'),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const input = parsed.data;

  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const accounts = await repo.listAccounts();
  const account = accounts.find((a) => a.id === input.accountId);
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  let magnitude: bigint;
  try {
    const parsedAmount = parseMoney(input.amount, account.currency);
    if (parsedAmount === null) return NextResponse.json({ error: 'Enter an amount' }, { status: 400 });
    magnitude = absMinor(parsedAmount);
  } catch (e) {
    if (e instanceof MoneyParseError) return NextResponse.json({ error: 'That amount could not be read' }, { status: 400 });
    throw e;
  }
  if (magnitude === 0n) return NextResponse.json({ error: 'Amount must not be zero' }, { status: 400 });

  // Store the amount signed in the ACCOUNT's own direction. For an asset account an
  // expense decreases the balance; for a credit card it increases what is owed.
  const increasesAccount =
    input.type === 'income' || input.type === 'refund'
      ? account.normalBalance === 'debit'
      : account.normalBalance === 'credit';
  const signed = increasesAccount ? magnitude : -magnitude;

  const merchantName = input.description.trim();
  const normalized = normalizeMerchant(merchantName);
  const merchantId = normalized ? await repo.upsertMerchant(merchantName, normalized, input.categoryId ?? null) : null;

  const id = await repo.insertTransaction({
    accountId: account.id,
    postedDate: input.postedDate,
    description: merchantName,
    originalDescription: merchantName,
    merchantName,
    amountMinor: signed,
    currency: account.currency,
    // Same currency as the workspace base in the manual-entry path; the import
    // pipeline supplies a converted value and the rate it used.
    baseAmountMinor: signed,
    type: input.type,
    categoryId: input.categoryId ?? null,
    businessClassification: input.businessClassification,
    notes: input.notes ?? null,
    source: 'manual',
  });

  await audit({
    actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
    action: 'transaction.create', entity: 'transaction', entityId: id,
  });

  return NextResponse.json({ ok: true, id, merchantId });
}

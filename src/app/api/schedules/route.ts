import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { recurringSeries } from '@/lib/db/schema';
import { WorkspaceRepo } from '@/lib/data/repository';
import { parseMoney, absMinor, MoneyParseError } from '@/lib/money';
import { occurrencesBetween } from '@/lib/finance/schedule';
import { todayIn } from '@/lib/finance/period';
import { audit } from '@/lib/auth/session';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.string().min(1),
  cadence: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annual', 'custom']),
  interval: z.coerce.number().int().min(1).max(365).default(1),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  direction: z.enum(['outflow', 'inflow']).default('outflow'),
  categoryId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
});

/**
 * Create a recurring item by hand.
 *
 * This deliberately requires NO transaction history. Detection needs months of data
 * to find a pattern; a user who just signed up still knows their rent is due on the
 * 1st, and should be able to say so.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const input = parsed.data;
  const currency = ctx.workspace.baseCurrency;

  let amount: bigint;
  try {
    const value = parseMoney(input.amount, currency);
    if (value === null || absMinor(value) === 0n) {
      return NextResponse.json({ error: 'Enter an amount' }, { status: 400 });
    }
    amount = absMinor(value);
  } catch (error) {
    if (error instanceof MoneyParseError) {
      return NextResponse.json({ error: 'That amount could not be read' }, { status: 400 });
    }
    throw error;
  }

  const today = todayIn(ctx.user.timezone);
  const dayOfMonth = input.dayOfMonth ?? Number(input.startDate.slice(8, 10));

  const next = occurrencesBetween(
    { cadence: input.cadence, interval: input.interval, dayOfMonth, startDate: input.startDate, endDate: input.endDate ?? null },
    today, `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`, 5,
  )[0] ?? input.startDate;

  const rows = await withUser(ctx.user.id, (tx) =>
    tx.insert(recurringSeries).values({
      workspaceId: ctx.workspace.id,
      name: input.name,
      merchantName: input.name,
      amountMinor: amount,
      currency,
      cadence: input.cadence,
      intervalCount: input.interval,
      dayOfMonth,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      nextExpectedDate: next,
      direction: input.direction,
      type: input.direction === 'inflow' ? 'income' : 'expense',
      categoryId: input.categoryId ?? null,
      accountId: input.accountId ?? null,
      kind: input.direction === 'inflow' ? 'income' : 'bill',
      isManual: true,
      // A schedule the user typed in is a fact, not a guess.
      status: 'active',
      detectionConfidence: 100,
      isWanted: true,
    }).returning({ id: recurringSeries.id }),
  );

  await audit({
    actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
    action: 'schedule.create', entity: 'recurring_series', entityId: rows[0]!.id,
  });

  return NextResponse.json({ ok: true, id: rows[0]!.id, nextExpectedDate: next });
}

export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const schedules = await repo.listManualSchedules();
  return NextResponse.json({
    schedules: schedules.map((s) => ({ ...s, amountMinor: s.amountMinor.toString() })),
  });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { userProfiles, goals } from '@/lib/db/schema';
import { createAccount, ACCOUNT_NORMAL_BALANCE } from '@/lib/data/bootstrap';
import { seedDemoData, hasAnyTransactions } from '@/lib/data/demo';
import { parseMoney, absMinor } from '@/lib/money';
import { todayIn, startOfMonth, addMonths } from '@/lib/finance/period';
import { audit } from '@/lib/auth/session';

const schema = z.object({
  incomeSchedule: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular']).optional(),
  incomeAmount: z.string().nullable().optional(),
  accounts: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    type: z.string(),
    balance: z.string(),
  })).max(20).default([]),
  goal: z.object({
    name: z.string().trim().min(1).max(120),
    target: z.string(),
    targetDate: z.string().nullable(),
  }).nullable().optional(),
  loadDemo: z.boolean().default(false),
  /**
   * What they said they are here for, and how much detail they want. Stored so the
   * app can behave differently afterwards rather than asking and forgetting — the
   * whole point of a personalised setup.
   */
  primaryIntent: z.string().max(40).nullable().optional(),
  experienceLevel: z.enum(['simple', 'detailed']).optional(),
});

export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const input = parsed.data;

  const currency = ctx.workspace.baseCurrency;
  const today = todayIn(ctx.user.timezone);
  // Accounts open at the start of the visible history window so early transactions
  // are not silently excluded from the balance.
  const openingDate = startOfMonth(addMonths(today, -5));

  const safeParseAmount = (value: string | null | undefined): bigint => {
    if (!value) return 0n;
    try { return absMinor(parseMoney(value, currency) ?? 0n); } catch { return 0n; }
  };

  for (const account of input.accounts) {
    const type = (account.type in ACCOUNT_NORMAL_BALANCE ? account.type : 'chequing') as keyof typeof ACCOUNT_NORMAL_BALANCE;
    await createAccount(ctx.user.id, ctx.workspace.id, {
      name: account.name,
      type,
      currency,
      openingBalanceMinor: safeParseAmount(account.balance),
      openingBalanceDate: openingDate,
    });
  }

  await withUser(ctx.user.id, async (tx) => {
    await tx.update(userProfiles).set({
      incomeSchedule: input.incomeSchedule ?? null,
      approxIncomeMinor: input.incomeAmount ? safeParseAmount(input.incomeAmount) : null,
      primaryIntent: input.primaryIntent ?? null,
      experienceLevel: input.experienceLevel ?? 'simple',
      onboardingCompletedAt: new Date(),
      onboardingStep: 5,
    }).where(eq(userProfiles.userId, ctx.user.id));

    if (input.goal && input.goal.target) {
      const target = safeParseAmount(input.goal.target);
      if (target > 0n) {
        await tx.insert(goals).values({
          workspaceId: ctx.workspace.id,
          name: input.goal.name,
          kind: 'general',
          targetMinor: target,
          currentMinor: 0n,
          currency,
          targetDate: input.goal.targetDate || null,
          priority: 1,
        });
      }
    }
  });

  if (input.loadDemo && !(await hasAnyTransactions(ctx.user.id, ctx.workspace.id))) {
    await seedDemoData(ctx.user.id, ctx.workspace.id, today);
  }

  await audit({
    actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
    action: 'onboarding.complete', entity: 'workspace', entityId: ctx.workspace.id,
  });

  return NextResponse.json({ ok: true });
}

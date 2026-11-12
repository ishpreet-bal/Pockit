import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { audit } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { ACTION_PARAMS, SCREENS, type ActionKind } from '@/lib/ai/actions';
import { nextDayOfMonth } from '@/lib/finance/cards';
import { todayIn } from '@/lib/finance/period';
import { POST as addTransaction } from '@/app/api/transactions/route';
import { POST as addSchedule } from '@/app/api/schedules/route';
import { POST as addGoal } from '@/app/api/mobile/goals/route';
import { GET as getBudget, POST as saveBudget } from '@/app/api/mobile/budget/route';
import { PATCH as setDueDay } from '@/app/api/mobile/accounts/[id]/route';

export const dynamic = 'force-dynamic';

const body = z.object({
  kind: z.enum(Object.keys(ACTION_PARAMS) as [ActionKind, ...ActionKind[]]),
  params: z.record(z.string(), z.unknown()),
});

/** Runs another route's handler in this request, so a confirmed action passes the same checks as doing it by hand. */
const call = (handler: (r: Request, c?: never) => Promise<Response>, json: unknown, routeParams?: Record<string, string>) =>
  (handler as (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>)(
    new Request('http://pockit.internal/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(json) }),
    routeParams ? { params: Promise.resolve(routeParams) } : undefined,
  );

/**
 * Do what Pock offered, after the person tapped "Do it".
 *
 * The parameters come back from the phone, so they are checked again here, and
 * each action runs through the endpoint the app already uses for it by hand: the
 * person could have done exactly this themselves, so nothing new is reachable.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const limit = await checkRateLimit(`pock-act:${ctx.user.id}`, 60, 60 * 60);
  if (!limit.allowed) return NextResponse.json({ error: 'Lots of changes in a short time. Try again in a little while.' }, { status: 429 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'That action wasn’t understood.' }, { status: 400 });
  const { kind } = parsed.data;
  const p = ACTION_PARAMS[kind].safeParse(parsed.data.params);
  if (!p.success) return NextResponse.json({ error: 'That action is missing something. Ask Pock again.' }, { status: 400 });
  const today = todayIn(ctx.user.timezone);

  let res: Response;
  switch (kind) {
    case 'add_purchase': {
      const a = p.data as z.infer<typeof ACTION_PARAMS.add_purchase>;
      res = await call(addTransaction, { amount: a.amount.toFixed(2), description: a.description, accountId: a.accountId, categoryId: a.categoryId, postedDate: a.date, type: a.income ? 'income' : 'expense' });
      break;
    }
    case 'add_bill': {
      const a = p.data as z.infer<typeof ACTION_PARAMS.add_bill>;
      res = await call(addSchedule, { name: a.name, amount: a.amount.toFixed(2), cadence: 'monthly', dayOfMonth: a.dayOfMonth, startDate: nextDayOfMonth(today, a.dayOfMonth), direction: 'outflow', categoryId: a.categoryId });
      break;
    }
    case 'create_goal': {
      const a = p.data as z.infer<typeof ACTION_PARAMS.create_goal>;
      res = await call(addGoal, { name: a.name, target: a.target, saved: 0, targetDate: a.targetDate });
      break;
    }
    case 'set_budget': {
      const a = p.data as z.infer<typeof ACTION_PARAMS.set_budget>;
      // The plan is saved whole: keep every other category as it is, change this one.
      const current = await (await getBudget()).json() as { categories: { id: string; planMinor: number | null }[]; rollover?: boolean; resetsOn?: 'month' | 'payday' };
      const lines = (current.categories ?? []).filter((l) => l.planMinor && l.id !== a.categoryId).map((l) => ({ categoryId: l.id, amount: l.planMinor! / 100 }));
      lines.push({ categoryId: a.categoryId, amount: a.amount });
      res = await call(saveBudget, { lines, rollover: current.rollover, resetsOn: current.resetsOn });
      break;
    }
    case 'set_card_due_day': {
      const a = p.data as z.infer<typeof ACTION_PARAMS.set_card_due_day>;
      res = await call(setDueDay as never, { paymentDueDay: a.day }, { id: a.accountId });
      break;
    }
    case 'open_screen': {
      const a = p.data as z.infer<typeof ACTION_PARAMS.open_screen>;
      return NextResponse.json({ ok: true, open: SCREENS[a.screen].path });
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    return NextResponse.json({ error: err.error ?? 'That couldn’t be done.' }, { status: res.status });
  }
  await audit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: `pock.act.${kind}`, entity: 'pock' });
  const OPEN: Partial<Record<ActionKind, string>> = { add_purchase: '/transactions', add_bill: '/bills', create_goal: '/goals', set_budget: '/budget', set_card_due_day: '/accounts' };
  return NextResponse.json({ ok: true, open: OPEN[kind] ?? null });
}

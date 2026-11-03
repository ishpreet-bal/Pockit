import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { accounts } from '@/lib/db/schema';
import { audit } from '@/lib/auth/session';
import { WorkspaceRepo } from '@/lib/data/repository';
import { allAccountBalances } from '@/lib/finance/ledger';
import { addDays, todayIn } from '@/lib/finance/period';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

/** Current balances use the same ledger calculation as the website. */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const [accounts, txns] = await Promise.all([
    repo.listAccounts(), repo.listTransactions({ includeSplits: false, includeShares: false }),
  ]);
  const balances = new Map(allAccountBalances(accounts, txns, todayIn(ctx.user.timezone)).map((b) => [b.accountId, b]));
  return NextResponse.json({
    accounts: accounts.filter((a) => a.isActive).map((a) => {
      const balance = balances.get(a.id)!.rawMinor;
      return {
        id: a.id, name: a.name, type: a.type, currency: a.currency,
        balanceMinor: Number(balance),
        balanceFormatted: formatMoney(balance, a.currency, { cents: 'always', locale: ctx.user.locale }),
        normalBalance: a.normalBalance,
      };
    }),
  });
}

const body = z.object({
  /** Dollars in the everyday account right now. */
  amount: z.number().min(-10_000_000).max(100_000_000),
});

/**
 * "This is what's in my everyday account right now."
 *
 * Sets the chequing account's balance as of today (creating the account if there
 * isn't one). It counts from tomorrow, because a balance read off a banking app
 * already includes today's spending — counting today's transactions on top would
 * take them off twice.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter an amount.' }, { status: 400 });

  const minor = BigInt(Math.round(parsed.data.amount * 100));
  const tomorrow = addDays(todayIn(ctx.user.timezone), 1);

  await withUser(ctx.user.id, async (tx) => {
    const found = await tx.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.workspaceId, ctx.workspace.id), eq(accounts.type, 'chequing'), isNull(accounts.deletedAt))).limit(1);
    if (found[0]) {
      await tx.update(accounts).set({ openingBalanceMinor: minor, openingBalanceDate: tomorrow, updatedAt: new Date() }).where(eq(accounts.id, found[0].id));
    } else {
      await tx.insert(accounts).values({
        workspaceId: ctx.workspace.id, name: 'Everyday account', type: 'chequing', normalBalance: 'debit',
        currency: ctx.workspace.baseCurrency, openingBalanceMinor: minor, openingBalanceDate: tomorrow,
      });
    }
  });
  await audit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: 'account.set_balance', entity: 'account' });
  return NextResponse.json({ ok: true });
}

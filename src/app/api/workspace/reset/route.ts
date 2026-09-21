import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/guard';
import { withUser } from '@/lib/db/client';
import { audit } from '@/lib/auth/session';
import {
  transactions, transactionSplits, imports, importCandidates,
  budgets, budgetAllocations, goals, goalContributions,
  recurringSeries, merchantRules, insights, notifications,
  holdings, debts, netWorthSnapshots, invoices, customers, vendors,
  workspaces,
} from '@/lib/db/schema';

/**
 * Start over: erase this workspace's financial records, keep the account.
 *
 * Deliberately NOT a soft delete. A soft delete would leave the old figures in
 * every sum that does not filter on `deletedAt`, which is the worst possible
 * outcome for someone who asked to start clean — a dashboard that still remembers.
 *
 * Scoped to the ACTIVE workspace only, so resetting personal finances cannot take
 * business records with it. Categories and accounts are kept: they are setup, not
 * history, and rebuilding them by hand is the tedious part nobody wants to redo.
 *
 * Requires the account password. This is the one irreversible action in the app,
 * and a stray click on a settings page should not be able to reach it.
 */
export async function POST(request: Request) {
  const { user, workspace } = await requireAuth();

  let body: { password?: unknown; confirm?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (body.confirm !== workspace.name) {
    return NextResponse.json(
      { error: `Type the workspace name exactly — "${workspace.name}" — to confirm.` },
      { status: 400 },
    );
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (password === '') {
    return NextResponse.json({ error: 'Enter your password to confirm.' }, { status: 400 });
  }

  const { verifyPassword } = await import('@/lib/auth/password');
  const { findUserById } = await import('@/lib/data/bootstrap');
  const row = await findUserById(user.id);
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    return NextResponse.json({ error: 'That password is not correct.' }, { status: 401 });
  }

  const deleted = await withUser(user.id, async (tx) => {
    const ws = workspace.id;
    const counts: Record<string, number> = {};

    // Order matters: children before parents, so no statement can trip a foreign
    // key on rows that are about to be removed anyway.
    const steps: [string, () => Promise<unknown>][] = [
      ['splits', () => tx.delete(transactionSplits).where(eq(transactionSplits.workspaceId, ws))],
      ['candidates', () => tx.delete(importCandidates).where(eq(importCandidates.workspaceId, ws))],
      ['imports', () => tx.delete(imports).where(eq(imports.workspaceId, ws))],
      ['goalContributions', () => tx.delete(goalContributions).where(eq(goalContributions.workspaceId, ws))],
      ['budgetAllocations', () => tx.delete(budgetAllocations).where(eq(budgetAllocations.workspaceId, ws))],
      ['budgets', () => tx.delete(budgets).where(eq(budgets.workspaceId, ws))],
      ['goals', () => tx.delete(goals).where(eq(goals.workspaceId, ws))],
      ['recurring', () => tx.delete(recurringSeries).where(eq(recurringSeries.workspaceId, ws))],
      ['rules', () => tx.delete(merchantRules).where(eq(merchantRules.workspaceId, ws))],
      ['insights', () => tx.delete(insights).where(eq(insights.workspaceId, ws))],
      ['notifications', () => tx.delete(notifications).where(eq(notifications.workspaceId, ws))],
      ['holdings', () => tx.delete(holdings).where(eq(holdings.workspaceId, ws))],
      ['debts', () => tx.delete(debts).where(eq(debts.workspaceId, ws))],
      ['netWorth', () => tx.delete(netWorthSnapshots).where(eq(netWorthSnapshots.workspaceId, ws))],
      ['invoices', () => tx.delete(invoices).where(eq(invoices.workspaceId, ws))],
      ['customers', () => tx.delete(customers).where(eq(customers.workspaceId, ws))],
      ['vendors', () => tx.delete(vendors).where(eq(vendors.workspaceId, ws))],
      ['transactions', () => tx.delete(transactions).where(eq(transactions.workspaceId, ws))],
    ];

    for (const [name, run] of steps) {
      const result = (await run()) as { count?: number } | undefined;
      counts[name] = result?.count ?? 0;
    }

    // The workspace is no longer showing demo data once its demo data is gone.
    await tx.update(workspaces).set({ isDemo: false }).where(eq(workspaces.id, ws));

    return counts;
  });

  await audit({
    actorUserId: user.id,
    action: 'workspace.reset',
    entity: 'workspace',
    entityId: workspace.id,
  });

  return NextResponse.json({ ok: true, deleted });
}

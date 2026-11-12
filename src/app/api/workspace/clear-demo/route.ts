import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/guard';
import { withUser } from '@/lib/db/client';
import { audit } from '@/lib/auth/session';
import { clearSampleData, hasSampleData, onlySampleData } from '@/lib/data/clear-sample';
import {
  transactions, transactionSplits, imports, importCandidates,
  budgets, budgetAllocations, goals, goalContributions,
  recurringSeries, merchantRules, insights, notifications,
  holdings, debts, netWorthSnapshots, invoices, customers, vendors,
  accounts, workspaces, watchlistItems,
} from '@/lib/db/schema';

/**
 * Remove demo data and leave a genuinely empty workspace.
 *
 * Distinct from "Start over" in Settings, which is the destructive control for REAL
 * records and is gated behind a password. This one only ever runs on a workspace
 * flagged as demo — by definition, generated data nobody typed in — so it does not
 * ask anyone to confirm they meant to delete something they never created.
 *
 * It also removes ACCOUNTS, which the general reset deliberately keeps. Someone who
 * loaded the sample and now wants to start properly should not inherit a chequing
 * account and a Visa they never opened.
 */
export async function POST() {
  const { user, workspace } = await requireAuth();

  if (!workspace.isDemo && !(await hasSampleData(user.id, workspace.id))) {
    return NextResponse.json(
      { error: 'This workspace does not contain demo data. Use "Start over" in Settings instead.' },
      { status: 400 },
    );
  }

  // A bank connected, or anything typed in, on top of the sample: take out only the
  // sample, so real accounts and purchases stay exactly as they are.
  if (!(await onlySampleData(user.id, workspace.id))) {
    const removed = await clearSampleData(user.id, workspace.id);
    await audit({ actorUserId: user.id, workspaceId: workspace.id, action: 'workspace.demo_cleared', entity: 'workspace', entityId: workspace.id, metadata: { removed, kept: 'real data' } });
    return NextResponse.json({ ok: true, removed });
  }

  await withUser(user.id, async (tx) => {
    const ws = workspace.id;
    // Children before parents, so nothing trips a foreign key on its way out.
    await tx.delete(transactionSplits).where(eq(transactionSplits.workspaceId, ws));
    await tx.delete(importCandidates).where(eq(importCandidates.workspaceId, ws));
    await tx.delete(imports).where(eq(imports.workspaceId, ws));
    await tx.delete(goalContributions).where(eq(goalContributions.workspaceId, ws));
    await tx.delete(budgetAllocations).where(eq(budgetAllocations.workspaceId, ws));
    await tx.delete(budgets).where(eq(budgets.workspaceId, ws));
    await tx.delete(goals).where(eq(goals.workspaceId, ws));
    await tx.delete(recurringSeries).where(eq(recurringSeries.workspaceId, ws));
    await tx.delete(merchantRules).where(eq(merchantRules.workspaceId, ws));
    await tx.delete(insights).where(eq(insights.workspaceId, ws));
    await tx.delete(notifications).where(eq(notifications.workspaceId, ws));
    await tx.delete(holdings).where(eq(holdings.workspaceId, ws));
    await tx.delete(debts).where(eq(debts.workspaceId, ws));
    await tx.delete(netWorthSnapshots).where(eq(netWorthSnapshots.workspaceId, ws));
    await tx.delete(invoices).where(eq(invoices.workspaceId, ws));
    await tx.delete(customers).where(eq(customers.workspaceId, ws));
    await tx.delete(vendors).where(eq(vendors.workspaceId, ws));
    await tx.delete(watchlistItems).where(eq(watchlistItems.workspaceId, ws));
    await tx.delete(transactions).where(eq(transactions.workspaceId, ws));
    await tx.delete(accounts).where(eq(accounts.workspaceId, ws));

    await tx.update(workspaces).set({ isDemo: false }).where(eq(workspaces.id, ws));
  });

  await audit({
    actorUserId: user.id, workspaceId: workspace.id,
    action: 'workspace.demo_cleared', entity: 'workspace', entityId: workspace.id,
  });

  return NextResponse.json({ ok: true });
}

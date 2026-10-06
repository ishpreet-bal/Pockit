import { NextResponse } from 'next/server';
import { and, eq, like } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { accounts, bankConnections } from '@/lib/db/schema';
import { openToken, plaidConfigured, removeItem } from '@/lib/bank/plaid';

export const dynamic = 'force-dynamic';

/** Connected banks, their status, and when they last synced. */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const rows = await withUser(ctx.user.id, (tx) => tx.select({
    id: bankConnections.id, institution: bankConnections.institutionName, status: bankConnections.status,
    error: bankConnections.error, lastSyncedAt: bankConnections.lastSyncedAt,
  }).from(bankConnections).where(eq(bankConnections.workspaceId, ctx.workspace.id)));
  return NextResponse.json({ available: plaidConfigured(), connections: rows });
}

/**
 * Disconnect a bank: Plaid forgets the login and we delete the token. Accounts and
 * past transactions stay (they're your history) but stop updating.
 */
export async function DELETE(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which bank?' }, { status: 400 });
  const conn = (await withUser(ctx.user.id, (tx) => tx.select().from(bankConnections)
    .where(and(eq(bankConnections.id, id), eq(bankConnections.workspaceId, ctx.workspace.id))).limit(1)))[0];
  if (!conn) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  try { await removeItem(openToken(conn.accessTokenEnc)); } catch { /* already gone at Plaid — still forget it here */ }
  await withUser(ctx.user.id, async (tx) => {
    await tx.update(accounts).set({ externalProvider: null, externalId: null })
      .where(and(eq(accounts.workspaceId, ctx.workspace.id), like(accounts.externalProvider, `plaid:${conn.id}`)));
    await tx.delete(bankConnections).where(eq(bankConnections.id, conn.id));
  });
  return NextResponse.json({ ok: true });
}

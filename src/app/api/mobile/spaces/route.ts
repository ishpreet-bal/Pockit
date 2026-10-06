import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { getUserWorkspaces } from '@/lib/auth/session';
import { withUser, withoutUser } from '@/lib/db/client';
import { accounts, spaceInvites, transactions, userProfiles, users, workspaceMembers, workspaces } from '@/lib/db/schema';
import { seedCategories, seedNotificationRules } from '@/lib/data/bootstrap';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { splitEvenly } from '@/lib/finance/split';

export const dynamic = 'force-dynamic';

/**
 * Shared spaces: your own Personal space plus any household you share. The app
 * picks which one it's looking at with the x-pockit-space header.
 */

async function membersOf(workspaceIds: string[]) {
  if (!workspaceIds.length) return [];
  // Names of the people you share a space with (server-side, scoped to your spaces).
  return withoutUser((tx) => tx.select({ workspaceId: workspaceMembers.workspaceId, userId: workspaceMembers.userId, role: workspaceMembers.role, name: userProfiles.displayName, email: users.email })
    .from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).leftJoin(userProfiles, eq(userProfiles.userId, workspaceMembers.userId))
    .where(inArray(workspaceMembers.workspaceId, workspaceIds)));
}
const display = (m: { name: string | null; email: string }) => m.name?.trim() || m.email.split('@')[0]!;

export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const spaces = (await getUserWorkspaces(ctx.user.id)).filter((w) => !w.isDemo);
  const members = await membersOf(spaces.map((s) => s.id));
  const spaceId = new URL(request.url).searchParams.get('split');

  // Who paid what in a shared space this month, and how to square up.
  let split = null;
  if (spaceId && spaces.some((s) => s.id === spaceId)) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const rows = await withUser(ctx.user.id, (tx) => tx.select({ by: transactions.createdBy, amt: transactions.baseAmountMinor, type: transactions.type })
      .from(transactions).where(and(eq(transactions.workspaceId, spaceId), gte(transactions.postedDate, start), lte(transactions.postedDate, end), isNull(transactions.deletedAt))));
    const paid = new Map<string, number>();
    for (const r of rows) if (r.by && (r.type === 'expense' || r.type === 'refund')) paid.set(r.by, (paid.get(r.by) ?? 0) + (r.type === 'refund' ? -1 : 1) * Math.abs(Number(r.amt)));
    split = splitEvenly(members.filter((m) => m.workspaceId === spaceId).map((m) => ({ id: m.userId, name: m.userId === ctx.user.id ? 'You' : display(m) })), paid);
  }

  return NextResponse.json({
    active: ctx.workspace.id,
    spaces: spaces.map((s) => ({
      id: s.id, name: s.name, kind: s.kind, role: s.role,
      members: members.filter((m) => m.workspaceId === s.id).map((m) => ({ name: display(m), you: m.userId === ctx.user.id })),
    })),
    split,
  });
}

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: z.string().trim().min(1).max(40) }),
  z.object({ action: z.literal('invite'), spaceId: z.string().uuid() }),
  z.object({ action: z.literal('join'), code: z.string().trim().min(4).max(12) }),
  z.object({ action: z.literal('leave'), spaceId: z.string().uuid() }),
]);

export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Something was missing. Try again.' }, { status: 400 });
  const input = parsed.data;
  const mine = await getUserWorkspaces(ctx.user.id);

  if (input.action === 'create') {
    const id = await withUser(ctx.user.id, async (tx) => {
      const made = await tx.insert(workspaces).values({ ownerUserId: ctx.user.id, name: input.name, kind: 'household', baseCurrency: ctx.workspace.baseCurrency }).returning({ id: workspaces.id });
      const wid = made[0]!.id;
      await tx.insert(workspaceMembers).values({ workspaceId: wid, userId: ctx.user.id, role: 'owner' });
      await seedCategories(tx, wid);
      await seedNotificationRules(tx, wid);
      // Somewhere for shared purchases to land. Who paid is recorded on each purchase.
      await tx.insert(accounts).values({ workspaceId: wid, name: 'Shared spending', type: 'chequing', normalBalance: 'debit', currency: ctx.workspace.baseCurrency });
      return wid;
    });
    return NextResponse.json({ id });
  }

  if (input.action === 'invite') {
    if (!mine.some((w) => w.id === input.spaceId && w.kind === 'household')) return NextResponse.json({ error: 'You can only invite people to a shared space.' }, { status: 400 });
    // 8 letters from an alphabet without look-alikes (no 0/O, 1/I/L).
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const code = [...randomBytes(8)].map((b) => alphabet[b % alphabet.length]).join('');
    await withUser(ctx.user.id, (tx) => tx.insert(spaceInvites).values({ code, workspaceId: input.spaceId, createdBy: ctx.user.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) }));
    return NextResponse.json({ code, expiresInDays: 7 });
  }

  if (input.action === 'join') {
    const limit = await checkRateLimit(`join:${ctx.user.id}`, 10, 15 * 60);
    if (!limit.allowed) return NextResponse.json({ error: 'Too many tries. Wait a few minutes.' }, { status: 429 });
    const code = input.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Invites are read server-side by code — the joiner isn't a member yet, so RLS would hide it.
    const inv = (await withoutUser((tx) => tx.select().from(spaceInvites).where(eq(spaceInvites.code, code)).limit(1)))[0];
    if (inv && mine.some((w) => w.id === inv.workspaceId)) return NextResponse.json({ id: inv.workspaceId, already: true });
    if (!inv || inv.usedAt || inv.expiresAt < new Date()) return NextResponse.json({ error: 'That code didn’t work. It may have expired — ask for a new one.' }, { status: 404 });
    await withUser(ctx.user.id, (tx) => tx.insert(workspaceMembers).values({ workspaceId: inv.workspaceId, userId: ctx.user.id, role: 'member' }));
    await withoutUser((tx) => tx.update(spaceInvites).set({ usedBy: ctx.user.id, usedAt: new Date() }).where(eq(spaceInvites.code, code)));
    return NextResponse.json({ id: inv.workspaceId });
  }

  // leave
  const space = mine.find((w) => w.id === input.spaceId);
  if (!space || space.kind !== 'household') return NextResponse.json({ error: 'You can only leave a shared space.' }, { status: 400 });
  if (space.role === 'owner') return NextResponse.json({ error: 'You started this space, so it stays with you. Others can leave it any time.' }, { status: 400 });
  await withUser(ctx.user.id, (tx) => tx.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.spaceId), eq(workspaceMembers.userId, ctx.user.id))));
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { watchlists } from '@/lib/db/schema';
import { listsFor, ownsList } from '@/lib/investing/lists';

const nameSchema = z.string().trim().min(1, 'Give the list a name.').max(40, 'Keep the name under 40 characters.');

export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const lists = await withUser(ctx.user.id, (tx) => listsFor(tx, ctx.workspace.id));
  return NextResponse.json({ lists });
}

export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = z.object({ name: nameSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Give the list a name.' }, { status: 400 });
  }

  try {
    const created = await withUser(ctx.user.id, async (tx) => {
      const existing = await listsFor(tx, ctx.workspace.id);
      // Ten is not a technical limit; it is the point past which a list picker stops
      // being a way to find things and becomes another thing to search.
      if (existing.length >= 10) throw new LimitError('Ten lists is the maximum. Rename or delete one first.');
      const rows = await tx
        .insert(watchlists)
        .values({ workspaceId: ctx.workspace.id, name: parsed.data.name, position: existing.length })
        .returning({ id: watchlists.id, name: watchlists.name });
      return rows[0];
    });
    return NextResponse.json({ list: { ...created, count: 0 } });
  } catch (error) {
    if (error instanceof LimitError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: `You already have a list called ${parsed.data.name}.` }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = z
    .object({ id: z.string().uuid(), name: nameSchema })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Give the list a name.' }, { status: 400 });
  }

  try {
    await withUser(ctx.user.id, async (tx) => {
      await tx
        .update(watchlists)
        .set({ name: parsed.data.name })
        .where(and(eq(watchlists.id, parsed.data.id), eq(watchlists.workspaceId, ctx.workspace.id)));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: `You already have a list called ${parsed.data.name}.` }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}

/**
 * Deleting a list deletes what is on it, by cascade.
 *
 * The last list cannot be deleted. Not for tidiness: every symbol added from a card
 * elsewhere in the app lands on the first list, and a workspace with none would turn
 * every star button into an error.
 */
export async function DELETE(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const id = new URL(request.url).searchParams.get('id')?.trim() ?? '';
  if (id === '') return NextResponse.json({ error: 'Pass a list id.' }, { status: 400 });

  const result = await withUser(ctx.user.id, async (tx) => {
    if (!(await ownsList(tx, ctx.workspace.id, id))) return 'missing' as const;
    const all = await listsFor(tx, ctx.workspace.id);
    if (all.length <= 1) return 'last' as const;
    await tx.delete(watchlists).where(and(eq(watchlists.id, id), eq(watchlists.workspaceId, ctx.workspace.id)));
    return 'ok' as const;
  });

  if (result === 'missing') return NextResponse.json({ error: 'That list no longer exists.' }, { status: 404 });
  if (result === 'last') {
    return NextResponse.json({ error: 'This is your only list, so it cannot be deleted. Rename it instead.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

class LimitError extends Error {}

/** SQLSTATE on the error chain, not a regex on the message — the driver wraps the original. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === 'object' && (current as { code?: string }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

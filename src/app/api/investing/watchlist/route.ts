import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { watchlistItems } from '@/lib/db/schema';
import { marketData, catalogEntry } from '@/lib/market';
import { defaultListId, ownsList } from '@/lib/investing/lists';

const addSchema = z.object({
  symbol: z.string().trim().min(1).max(12),
  name: z.string().trim().max(120).optional(),
  // Omitted by the star button on a card, which has no idea lists exist. Those
  // land on the first list rather than failing.
  listId: z.string().uuid().optional(),
});

/** Search for a symbol to add. Returns nothing for an empty query rather than everything. */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query === '') return NextResponse.json({ results: [] });

  const { searchCatalog } = await import('@/lib/market');
  return NextResponse.json({ results: searchCatalog(query) });
}

export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a symbol.' }, { status: 400 });

  const symbol = parsed.data.symbol.toUpperCase();

  // Reject a symbol nothing recognises, rather than storing a row that can only
  // ever render as a blank price. The catalogue is checked first so this works
  // identically with or without a market-data key.
  const entry = catalogEntry(symbol);
  const quote = entry ? null : await marketData().quote(symbol);
  if (!entry && !quote) {
    return NextResponse.json(
      { error: `No instrument found for ${symbol}. Try searching by name instead.` },
      { status: 404 },
    );
  }

  try {
    const outcome = await withUser(ctx.user.id, async (tx) => {
      const requested = parsed.data.listId;
      if (requested && !(await ownsList(tx, ctx.workspace.id, requested))) return 'no-list' as const;
      const listId = requested ?? (await defaultListId(tx, ctx.workspace.id));
      await tx.insert(watchlistItems).values({
        workspaceId: ctx.workspace.id,
        listId,
        symbol,
        name: parsed.data.name?.trim() || entry?.name || symbol,
      });
      return 'ok' as const;
    });
    if (outcome === 'no-list') {
      return NextResponse.json({ error: 'That list no longer exists.' }, { status: 404 });
    }
  } catch (error) {
    // The unique index is what actually prevents duplicates; this turns the
    // constraint violation into a sentence rather than a 500.
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: `${symbol} is already on that list.` }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}

/**
 * Is this a unique-constraint violation?
 *
 * Checked by SQLSTATE on the error CHAIN, not by matching the message. The driver
 * wraps the original error, so the outer message is only "Failed query: insert
 * into ..." — a regex on it silently never matched, and every duplicate came back
 * as a 500 instead of the sentence explaining it.
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === 'object' && (current as { code?: string }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function DELETE(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  // Callers that already hold the row id use it; a star button on a card only knows
  // the symbol, and making it look the id up first would be a round trip for nothing.
  const params = new URL(request.url).searchParams;
  const id = params.get('id')?.trim() ?? '';
  const symbol = params.get('symbol')?.trim().toUpperCase() ?? '';
  // Without a list, unfollowing by symbol removes it everywhere. That is what the
  // star on an asset page means — it is lit if the symbol is on ANY list, so
  // clearing it from one and leaving it on another would put the star back on.
  const listId = params.get('listId')?.trim() ?? '';
  if (id === '' && symbol === '') {
    return NextResponse.json({ error: 'Pass an id or a symbol.' }, { status: 400 });
  }

  await withUser(ctx.user.id, async (tx) => {
    await tx.delete(watchlistItems).where(
      and(
        eq(watchlistItems.workspaceId, ctx.workspace.id),
        id !== '' ? eq(watchlistItems.id, id) : eq(watchlistItems.symbol, symbol),
        listId !== '' ? eq(watchlistItems.listId, listId) : undefined,
      ),
    );
  });

  return NextResponse.json({ ok: true });
}

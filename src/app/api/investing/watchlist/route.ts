import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { watchlistItems } from '@/lib/db/schema';
import { getMarketProvider } from '@/lib/market/provider';

const addSchema = z.object({
  symbol: z.string().trim().min(1).max(12),
  name: z.string().trim().max(120).optional(),
});

/** Search for a symbol to add. Returns nothing for an empty query rather than everything. */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query === '') return NextResponse.json({ results: [] });

  const results = await getMarketProvider().search(query);
  return NextResponse.json({ results });
}

export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a symbol.' }, { status: 400 });

  const symbol = parsed.data.symbol.toUpperCase();

  // Reject a symbol the provider does not recognise, rather than storing a row that
  // can only ever render as a blank price.
  const quote = await getMarketProvider().quote(symbol);
  if (!quote) {
    return NextResponse.json(
      { error: `No price found for ${symbol}. Check the ticker and try again.` },
      { status: 404 },
    );
  }

  try {
    await withUser(ctx.user.id, async (tx) => {
      await tx.insert(watchlistItems).values({
        workspaceId: ctx.workspace.id,
        symbol,
        name: parsed.data.name?.trim() || symbol,
      });
    });
  } catch (error) {
    // The unique index is what actually prevents duplicates; this turns the
    // constraint violation into a sentence rather than a 500.
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: `${symbol} is already on your watchlist.` }, { status: 409 });
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

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (id === '') return NextResponse.json({ error: 'Missing id.' }, { status: 400 });

  await withUser(ctx.user.id, async (tx) => {
    await tx.delete(watchlistItems).where(
      and(eq(watchlistItems.id, id), eq(watchlistItems.workspaceId, ctx.workspace.id)),
    );
  });

  return NextResponse.json({ ok: true });
}

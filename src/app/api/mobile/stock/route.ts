import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { holdings, watchlistItems } from '@/lib/db/schema';
import { marketData, catalogEntry } from '@/lib/market';

export const dynamic = 'force-dynamic';

const n = (v: bigint | null | undefined) => (v === null || v === undefined ? null : Number(v));

/**
 * Everything the app's stock page shows except the chart (which has its own
 * endpoint so switching range doesn't refetch this): price, today's move, what it
 * is, and whether you follow or own it.
 *
 * The catalogue answers for the name and description when the provider can't, so
 * a quota-exhausted market-data key still gives a page rather than a blank.
 */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const symbol = new URL(request.url).searchParams.get('symbol')?.trim().toUpperCase() ?? '';
  if (!/^[A-Z0-9.\-^=]{1,12}$/.test(symbol)) return NextResponse.json({ error: 'Missing symbol.' }, { status: 400 });

  const source = marketData();
  const entry = catalogEntry(symbol);
  const [quote, profile, watched, owned] = await Promise.all([
    source.quote(symbol).catch(() => null),
    source.profile(symbol).catch(() => null),
    withUser(ctx.user.id, (tx) => tx.select({ id: watchlistItems.id }).from(watchlistItems)
      .where(and(eq(watchlistItems.workspaceId, ctx.workspace.id), eq(watchlistItems.symbol, symbol))).limit(1)),
    withUser(ctx.user.id, (tx) => tx.select({ quantity: holdings.quantity, value: holdings.currentValueMinor }).from(holdings)
      .where(and(eq(holdings.workspaceId, ctx.workspace.id), eq(holdings.symbol, symbol)))),
  ]);

  if (!quote && !profile && !entry) return NextResponse.json({ error: `Nothing found for ${symbol}.` }, { status: 404 });

  const units = owned.reduce((s, h) => s + Number(h.quantity), 0);
  return NextResponse.json({
    symbol,
    name: profile?.name ?? entry?.name ?? symbol,
    kind: profile?.kind ?? entry?.kind ?? 'stock',
    exchange: profile?.exchange ?? entry?.exchange ?? null,
    currency: quote?.currency ?? profile?.currency ?? entry?.currency ?? 'USD',
    description: profile?.description ?? null,
    sector: profile?.sector ?? entry?.sector ?? null,
    tracks: profile?.tracks ?? entry?.tracks ?? null,
    expenseRatioBps: profile?.expenseRatioBps ?? entry?.expenseRatioBps ?? null,
    priceMinor: n(quote?.priceMinor),
    changeMinor: n(quote?.changeMinor),
    changePct: quote?.changeBps == null ? null : quote.changeBps / 100,
    dayHighMinor: n(quote?.dayHighMinor),
    dayLowMinor: n(quote?.dayLowMinor),
    simulated: Boolean((quote as { simulated?: boolean } | null)?.simulated),
    watching: watched.length > 0,
    owned: units > 0 ? { units, valueMinor: quote ? Math.round(Number(quote.priceMinor) * units) : owned.reduce((s, h) => s + Number(h.value), 0) } : null,
  });
}

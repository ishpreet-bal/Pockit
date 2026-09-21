import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { marketData, HISTORY_RANGES, type HistoryRange } from '@/lib/market';

/**
 * Price history for one instrument over one range.
 *
 * Its own endpoint because changing the chart range should redraw the chart, not
 * re-render the page: the profile, fundamentals and news beside it have not changed.
 *
 * Minor units are serialised as numbers. They stay exact well past any price, and
 * bigint cannot be JSON-encoded.
 */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const params = new URL(request.url).searchParams;
  const symbol = params.get('symbol')?.trim() ?? '';
  const rangeParam = params.get('range') ?? '1M';
  if (symbol === '') return NextResponse.json({ error: 'Missing symbol.' }, { status: 400 });

  const range = (HISTORY_RANGES as string[]).includes(rangeParam) ? (rangeParam as HistoryRange) : '1M';
  const history = await marketData().history(symbol, range);

  if (!history) {
    // A null history is a real answer: this source cannot supply it. The chart says
    // so rather than drawing an approximation.
    return NextResponse.json({ available: false, range });
  }

  return NextResponse.json({
    available: true,
    range,
    currency: history.currency,
    source: history.source,
    asOf: history.asOf,
    simulated: history.simulated,
    points: history.candles.map((c) => ({
      t: c.t,
      close: Number(c.closeMinor) / 100,
      open: Number(c.openMinor) / 100,
      high: Number(c.highMinor) / 100,
      low: Number(c.lowMinor) / 100,
    })),
  });
}

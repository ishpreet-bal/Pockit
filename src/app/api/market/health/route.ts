import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { marketData } from '@/lib/market';

export const dynamic = 'force-dynamic';

/**
 * Is the configured market-data provider actually answering?
 *
 * A provider that fails degrades quietly: prices render as "—" and charts as
 * unavailable, which looks identical to having no key at all. That is the worst
 * kind of failure, because nothing on screen says which of the two it is. This
 * makes one real call and reports what came back, so "I set the key and it still
 * says sample data" has an answer instead of a guess.
 *
 * It never returns the key, or any part of it.
 */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const source = marketData();
  const configured = {
    twelvedata: Boolean(process.env.TWELVEDATA_API_KEY?.trim()),
    finnhub: Boolean(process.env.FINNHUB_API_KEY?.trim()),
  };

  // AAPL is the probe because every provider has it. A source that cannot answer
  // for Apple is not partially working, it is not working.
  const started = Date.now();
  const [quote, history] = await Promise.all([
    source.quote('AAPL').catch(() => null),
    source.history('AAPL', '1M').catch(() => null),
  ]);
  const ms = Date.now() - started;

  const problems: string[] = [];
  if (!configured.twelvedata && !configured.finnhub) {
    problems.push('No market-data key is set on this deployment, so prices are sample data.');
  }
  if (configured.twelvedata || configured.finnhub) {
    if (!quote) {
      problems.push(
        `${source.label} did not return a price for AAPL. The usual causes are a key that is ` +
        'not valid yet (new keys can take a few minutes), a daily request limit already spent, ' +
        'or the variable having been saved with quotes or a trailing space around it.',
      );
    }
    if (!history) {
      problems.push(
        `${source.label} did not return price history, so charts will read as unavailable. ` +
        "On Finnhub's free plan this is expected — historical candles are a paid endpoint. " +
        'Set TWELVEDATA_API_KEY instead, whose free tier includes them.',
      );
    }
  }

  return NextResponse.json({
    provider: { id: source.id, label: source.label, live: source.live },
    configured,
    probe: {
      quote: quote ? { priceMinor: Number(quote.priceMinor), currency: quote.currency, asOf: quote.asOf } : null,
      historyCandles: history?.candles.length ?? 0,
      ms,
    },
    ok: problems.length === 0,
    problems,
  });
}

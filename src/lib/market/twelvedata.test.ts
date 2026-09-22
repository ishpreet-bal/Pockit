import { describe, it, expect, vi, afterEach } from 'vitest';
import { TwelveDataSource } from './twelvedata';

function respond(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body } as unknown as Response);
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('TwelveDataSource', () => {
  it('reads a quote into exact minor units', async () => {
    vi.stubGlobal('fetch', respond({
      symbol: 'AAPL', name: 'Apple Inc.', currency: 'USD', exchange: 'NASDAQ',
      close: '184.37', previous_close: '182.00', change: '2.37', percent_change: '1.3022',
      high: '185.10', low: '181.55', datetime: '2026-09-22',
    }));
    const quote = await new TwelveDataSource('k').quote('AAPL');
    expect(quote?.priceMinor).toBe(18437n);
    expect(quote?.previousCloseMinor).toBe(18200n);
    // 1.3022% -> 130 basis points, rounded once and never as a float again.
    expect(quote?.changeBps).toBe(130);
    expect(quote?.simulated).toBe(false);
  });

  it('treats an error inside a 200 as no data, not as a price', async () => {
    // Twelve Data reports its rate limit with HTTP 200 and status: "error". Reading
    // that as a quote is how `undefined` reaches a screen dressed as a price.
    vi.stubGlobal('fetch', respond({ code: 429, message: 'API credits exceeded', status: 'error' }));
    expect(await new TwelveDataSource('k').quote('AAPL')).toBeNull();
  });

  it('returns history oldest-first, whatever order it arrives in', async () => {
    vi.stubGlobal('fetch', respond({
      meta: { symbol: 'VOO', currency: 'USD' },
      values: [
        { datetime: '2026-09-22', open: '3', high: '4', low: '2', close: '3.50', volume: '10' },
        { datetime: '2026-09-21', open: '2', high: '3', low: '1', close: '2.50', volume: '20' },
      ],
    }));
    const history = await new TwelveDataSource('k').history('VOO', '1M');
    expect(history?.candles.map((c) => c.t)).toEqual(['2026-09-21', '2026-09-22']);
    expect(history?.candles[0]?.closeMinor).toBe(250n);
    expect(history?.asOf).toBe('2026-09-22');
  });

  it('drops a candle with no close rather than inventing one', async () => {
    vi.stubGlobal('fetch', respond({
      meta: { currency: 'USD' },
      values: [
        { datetime: '2026-09-21', close: '2.50' },
        { datetime: '2026-09-22', close: '' },
      ],
    }));
    const history = await new TwelveDataSource('k').history('VOO', '1M');
    expect(history?.candles).toHaveLength(1);
  });

  it('never claims fundamentals or news it cannot get', async () => {
    const source = new TwelveDataSource('k');
    expect(await source.fundamentals('AAPL')).toBeNull();
    expect(await source.news('AAPL')).toEqual([]);
  });

  it('classifies instrument types it is given', async () => {
    vi.stubGlobal('fetch', respond({
      data: [
        { symbol: 'VOO', instrument_name: 'Vanguard S&P 500 ETF', instrument_type: 'ETF', exchange: 'NYSE' },
        { symbol: 'BTC/USD', instrument_name: 'Bitcoin', instrument_type: 'Digital Currency', exchange: 'Coinbase' },
        { symbol: 'NVDA', instrument_name: 'NVIDIA Corp', instrument_type: 'Common Stock', exchange: 'NASDAQ' },
      ],
    }));
    const results = await new TwelveDataSource('k').search('v');
    expect(results.map((r) => r.kind).sort()).toEqual(['crypto', 'etf', 'stock']);
  });

  it('ranks an exact symbol above a name that merely contains the text', async () => {
    vi.stubGlobal('fetch', respond({
      data: [
        { symbol: 'XNVDA', instrument_name: 'Something NV Holdings', instrument_type: 'Common Stock' },
        { symbol: 'NV', instrument_name: 'NV Energy', instrument_type: 'Common Stock' },
      ],
    }));
    const results = await new TwelveDataSource('k').search('nv');
    expect(results[0]?.symbol).toBe('NV');
  });
});

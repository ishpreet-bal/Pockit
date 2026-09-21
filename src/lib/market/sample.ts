import 'server-only';
import { catalogEntry, CATALOG_REVIEWED } from './catalog';
import type {
  AssetProfile, Fundamentals, History, HistoryRange, MarketDataSource, NewsItem, Quote,
} from './types';

/**
 * Development data, clearly marked as such.
 *
 * Its purpose is to let the entire interface be built, reviewed and tested before an
 * API key exists — not to stand in for a market. Three rules keep it honest:
 *
 *  1. Every value it returns carries `simulated: true`, and the UI is required to
 *     say so wherever one appears.
 *  2. It only answers for symbols in the catalogue. Inventing a price for any string
 *     typed in would let someone build a watchlist of instruments that do not exist.
 *  3. It returns NO news and NO fundamentals. Fabricated headlines and fabricated
 *     earnings are not "sample data", they are misinformation — those sections show
 *     as unavailable until a real source is connected.
 */
export class SampleSource implements MarketDataSource {
  readonly id = 'sample';
  readonly label = 'Sample data';
  readonly live = false;

  async quote(symbol: string): Promise<Quote | null> {
    const entry = catalogEntry(symbol);
    if (!entry) return null;

    // Read from the same price function the chart draws, so the headline figure and
    // the end of the line are the same number. Two independent random walks looked
    // fine in isolation and contradicted each other on screen.
    const today = dayNumber(Date.now());
    const price = priceAt(entry.symbol, today);
    const previous = priceAt(entry.symbol, today - 1);
    const change = price - previous;

    return {
      symbol: entry.symbol,
      priceMinor: BigInt(Math.round(price * 100)),
      currency: entry.currency,
      changeMinor: BigInt(Math.round(change * 100)),
      changeBps: Math.round((change / previous) * 10000),
      previousCloseMinor: BigInt(Math.round(previous * 100)),
      dayHighMinor: BigInt(Math.round(Math.max(price, previous) * 1.004 * 100)),
      dayLowMinor: BigInt(Math.round(Math.min(price, previous) * 0.996 * 100)),
      source: this.label,
      asOf: new Date().toISOString(),
      simulated: true,
    };
  }

  async quotes(symbols: string[]): Promise<Map<string, Quote>> {
    const out = new Map<string, Quote>();
    for (const s of symbols) {
      const q = await this.quote(s);
      if (q) out.set(s.toUpperCase(), q);
    }
    return out;
  }

  async history(symbol: string, range: HistoryRange): Promise<History | null> {
    const entry = catalogEntry(symbol);
    if (!entry) return null;

    const points = POINTS[range];
    const stepMs = STEP_MS[range];
    const end = Date.now();

    const candles = [];
    for (let i = points - 1; i >= 0; i--) {
      const at = end - i * stepMs;
      // Fractional days, so intraday ranges move within a day rather than sitting
      // flat, while every range still ends on exactly today's price.
      const d = dayNumber(at) + (stepMs < 86_400_000 ? ((at % 86_400_000) / 86_400_000) : 0);
      const close = priceAt(entry.symbol, d);
      const open = priceAt(entry.symbol, d - (stepMs < 86_400_000 ? 0.02 : 1));
      candles.push({
        t: new Date(at).toISOString(),
        openMinor: BigInt(Math.round(open * 100)),
        highMinor: BigInt(Math.round(Math.max(open, close) * 1.004 * 100)),
        lowMinor: BigInt(Math.round(Math.min(open, close) * 0.996 * 100)),
        closeMinor: BigInt(Math.round(close * 100)),
        volume: null,
      });
    }

    return {
      symbol: entry.symbol,
      range,
      currency: entry.currency,
      candles,
      source: this.label,
      asOf: new Date().toISOString(),
      simulated: true,
    };
  }

  async profile(symbol: string): Promise<AssetProfile | null> {
    const entry = catalogEntry(symbol);
    if (!entry) return null;
    return {
      symbol: entry.symbol,
      name: entry.name,
      kind: entry.kind,
      exchange: entry.exchange,
      currency: entry.currency,
      // The catalogue holds no marketing copy, and inventing a company description
      // would be fabrication of exactly the kind this class exists to avoid.
      description: null,
      sector: entry.sector ?? null,
      industry: entry.industry ?? null,
      country: entry.exchange === 'TSX' ? 'CA' : entry.kind === 'crypto' ? null : 'US',
      website: null,
      expenseRatioBps: entry.expenseRatioBps ?? null,
      tracks: entry.tracks ?? null,
      assetClassNote: entry.kind === 'crypto'
        ? `Reference data reviewed ${CATALOG_REVIEWED}. Cryptocurrencies are not securities and are not covered by investor protection schemes.`
        : null,
    };
  }

  /** Deliberately none: invented fundamentals would be misinformation. */
  async fundamentals(): Promise<Fundamentals | null> {
    return null;
  }

  /** Deliberately none: invented headlines would be misinformation. */
  async news(): Promise<NewsItem[]> {
    return [];
  }
}

const POINTS: Record<HistoryRange, number> = {
  '1D': 78, '5D': 65, '1M': 22, '6M': 126, YTD: 180, '1Y': 252, '5Y': 260, MAX: 240,
};

const STEP_MS: Record<HistoryRange, number> = {
  '1D': 5 * 60_000,
  '5D': 30 * 60_000,
  '1M': 86_400_000,
  '6M': 86_400_000,
  YTD: 86_400_000,
  '1Y': 86_400_000,
  '5Y': 7 * 86_400_000,
  MAX: 30 * 86_400_000,
};

/**
 * The price of a symbol on a given (possibly fractional) day.
 *
 * A smooth sum of sine waves rather than a random walk, for one reason: it is a pure
 * function of the symbol and the day, so every range of the chart and the quote all
 * agree, and the same day always renders the same price. A walk would have to be
 * replayed from a fixed origin on every call to achieve that.
 *
 * It is not a market model and makes no claim to be. It exists so the interface can
 * be built and reviewed before a data key exists.
 */
function priceAt(symbol: string, day: number): number {
  const entry = catalogEntry(symbol);
  const seed = seeded(symbol) * 100;
  const magnitude = entry?.kind === 'crypto'
    ? (symbol === 'BTC' ? 60000 : symbol === 'ETH' ? 3000 : 120)
    : entry?.kind === 'etf' ? 250 : 180;
  const base = magnitude * (0.6 + seeded(symbol) * 0.8);

  // Crypto swings harder than a broad fund; a single company sits in between.
  const amp = entry?.kind === 'crypto' ? 0.42 : entry?.kind === 'etf' ? 0.12 : 0.24;

  const wave =
    Math.sin(day / 180 + seed) * 0.55 +
    Math.sin(day / 47 + seed * 1.7) * 0.28 +
    Math.sin(day / 11 + seed * 3.1) * 0.12 +
    Math.sin(day / 2.3 + seed * 5.5) * 0.05;

  return Math.max(0.01, base * (1 + amp * wave));
}

/** Whole days since the epoch, so the series is anchored to the calendar. */
function dayNumber(ms: number): number {
  return Math.floor(ms / 86_400_000);
}

/** Deterministic 0..1 from a string, so sample data is stable between renders. */
function seeded(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

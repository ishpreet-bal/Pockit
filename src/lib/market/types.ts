/**
 * The shape of market data, independent of who supplies it.
 *
 * Every field that could be mistaken for live data carries its provenance: where it
 * came from, when, and whether it is real. That is not decoration — the single most
 * harmful thing this feature could do is show an invented price that looks real, so
 * the type system makes it impossible to render one without knowing.
 */

export type AssetKind = 'stock' | 'etf' | 'crypto';

/** Where a figure came from, carried alongside the figure itself. */
export interface Provenance {
  /** Human-readable source, e.g. "Finnhub" or "Sample data". */
  source: string;
  /** ISO timestamp the data represents. */
  asOf: string;
  /** True when the value is illustrative rather than real. */
  simulated: boolean;
}

export interface Quote extends Provenance {
  symbol: string;
  /** Last price in MINOR units of `currency`, so it is never a float. */
  priceMinor: bigint;
  currency: string;
  /** Change against the previous close, in minor units. Null when not reported. */
  changeMinor: bigint | null;
  /** Change in basis points (100 = 1%), so the percentage is exact too. */
  changeBps: number | null;
  previousCloseMinor: bigint | null;
  dayHighMinor: bigint | null;
  dayLowMinor: bigint | null;
}

/** One point on a price history. */
export interface Candle {
  /** ISO date (daily) or ISO datetime (intraday). */
  t: string;
  openMinor: bigint;
  highMinor: bigint;
  lowMinor: bigint;
  closeMinor: bigint;
  volume: number | null;
}

export interface History extends Provenance {
  symbol: string;
  range: HistoryRange;
  currency: string;
  candles: Candle[];
}

export type HistoryRange = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX';

export const HISTORY_RANGES: HistoryRange[] = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'];

/** Static description of an instrument. Not prices — this changes rarely. */
export interface AssetProfile {
  symbol: string;
  name: string;
  kind: AssetKind;
  exchange: string | null;
  currency: string;
  description: string | null;
  /** Stocks only. */
  sector: string | null;
  industry: string | null;
  country: string | null;
  website: string | null;
  /** ETFs only, in basis points. 3 = 0.03%. */
  expenseRatioBps: number | null;
  /** ETFs only — what the fund actually tracks. */
  tracks: string | null;
  /** Crypto only. */
  assetClassNote: string | null;
}

/** Point-in-time fundamentals. Every field optional: providers differ wildly. */
export interface Fundamentals extends Provenance {
  symbol: string;
  marketCapMinor: bigint | null;
  peRatio: number | null;
  epsMinor: bigint | null;
  revenueMinor: bigint | null;
  profitMarginPct: number | null;
  dividendYieldBps: number | null;
  week52HighMinor: bigint | null;
  week52LowMinor: bigint | null;
  volume: number | null;
  averageVolume: number | null;
  beta: number | null;
  currency: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string | null;
  url: string;
  source: string;
  publishedAt: string;
}

export interface SearchResult {
  symbol: string;
  name: string;
  kind: AssetKind;
  exchange: string | null;
  /** 0..1, higher is a better match. Used only for ordering. */
  score: number;
  /** Index ranges in `name`/`symbol` that matched, so the UI can highlight them. */
  matched: { field: 'symbol' | 'name'; start: number; end: number }[];
}

/**
 * Everything a provider must be able to answer.
 *
 * Deliberately split by concern rather than one god-method: a provider that can
 * serve quotes but not fundamentals returns null for the latter, and the UI degrades
 * to showing less rather than to showing something invented.
 */
export interface MarketDataSource {
  readonly id: string;
  readonly label: string;
  /** False when this source's prices are illustrative. */
  readonly live: boolean;

  quote(symbol: string): Promise<Quote | null>;
  quotes(symbols: string[]): Promise<Map<string, Quote>>;
  history(symbol: string, range: HistoryRange): Promise<History | null>;
  profile(symbol: string): Promise<AssetProfile | null>;
  fundamentals(symbol: string): Promise<Fundamentals | null>;
  news(symbol: string, limit?: number): Promise<NewsItem[]>;
}

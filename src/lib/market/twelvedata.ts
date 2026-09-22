import 'server-only';
import { catalogEntry } from './catalog';
import type {
  AssetKind, AssetProfile, Fundamentals, History, HistoryRange, MarketDataSource,
  NewsItem, Quote, SearchResult,
} from './types';

/**
 * Twelve Data.
 *
 * Chosen over Finnhub's free tier for one reason: historical candles. Finnhub puts
 * them behind a paid plan, so every chart in the app rendered as "unavailable" —
 * correct, and useless. Twelve Data's free key covers quotes, intraday and daily
 * time series, and `symbol_search` across tens of thousands of instruments, which is
 * also what lifts search off a hand-written list of 69.
 *
 * What it does NOT cover on the free plan is fundamentals and news. Those return
 * null and nothing, and the UI says so, exactly as before. A gap stated is fine; a
 * gap filled in from memory is not.
 */
/**
 * The free plan's ceiling: 8 API credits a minute, where a batch quote costs one
 * credit PER SYMBOL. One discovery page used to spend dozens — a quote and a
 * sparkline history for every card in every collection — so the quota was gone
 * before the page finished rendering, and the next click on a stock found nothing,
 * treated "nothing" as "does not exist", and showed a 404.
 *
 * This budget stops calling once the minute is spent and answers null instead,
 * which the UI already renders as "no price" rather than as a missing page. It is
 * per server instance, so it is a brake rather than a guarantee; Next's fetch cache
 * is what spares the quota across instances.
 */
const CREDITS_PER_MINUTE = Number(process.env.TWELVEDATA_CREDITS_PER_MINUTE ?? 8);
const spent: number[] = [];

function take(credits: number): boolean {
  const now = Date.now();
  while (spent.length > 0 && now - spent[0]! > 60_000) spent.shift();
  if (spent.length + credits > CREDITS_PER_MINUTE) return false;
  for (let i = 0; i < credits; i++) spent.push(now);
  return true;
}

export class TwelveDataSource implements MarketDataSource {
  readonly id = 'twelvedata';
  readonly label = 'Twelve Data';
  readonly live = true;
  /** Callers use this to skip optional calls — sparklines — that the plan cannot afford. */
  readonly constrained = CREDITS_PER_MINUTE <= 8;

  constructor(private readonly apiKey: string) {}

  private async get<T>(path: string, revalidate: number, credits = 1): Promise<T | null> {
    if (!take(credits)) return null;
    try {
      const sep = path.includes('?') ? '&' : '?';
      const res = await fetch(`https://api.twelvedata.com${path}${sep}apikey=${this.apiKey}`, {
        next: { revalidate },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as T & { status?: string; code?: number };
      // Twelve Data reports its own errors inside a 200, including the rate limit.
      // Treating those as data is how a "price" of undefined reaches a screen.
      if (body && typeof body === 'object' && body.status === 'error') return null;
      return body;
    } catch {
      return null;
    }
  }

  async quote(symbol: string): Promise<Quote | null> {
    const raw = await this.get<TdQuote>(`/quote?symbol=${encodeURIComponent(symbol)}`, 300);
    return raw ? toQuote(symbol, raw, this.label) : null;
  }

  /**
   * Several symbols in one request.
   *
   * The free plan allows 8 requests a minute, so a watchlist of twenty would be
   * rate-limited into blanks if each row fetched itself. Batching is what makes the
   * watchlist and the discovery grids work at all.
   */
  async quotes(symbols: string[]): Promise<Map<string, Quote>> {
    const out = new Map<string, Quote>();
    const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
    if (unique.length === 0) return out;

    // One symbol comes back as a bare quote; several come back keyed by symbol.
    for (const chunk of chunked(unique, Math.max(1, CREDITS_PER_MINUTE))) {
      if (chunk.length === 1) {
        const only = chunk[0]!;
        const one = await this.quote(only);
        if (one) out.set(only, one);
        continue;
      }
      const raw = await this.get<Record<string, TdQuote>>(
        `/quote?symbol=${encodeURIComponent(chunk.join(','))}`, 300, chunk.length,
      );
      if (!raw) continue;
      for (const [symbol, value] of Object.entries(raw)) {
        const quote = toQuote(symbol, value, this.label);
        if (quote) out.set(symbol.toUpperCase(), quote);
      }
    }
    return out;
  }

  async history(symbol: string, range: HistoryRange): Promise<History | null> {
    const { interval, outputsize, revalidate } = PLAN[range];
    const raw = await this.get<TdSeries>(
      `/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}`,
      revalidate,
    );
    if (!raw?.values?.length) return null;

    const entry = catalogEntry(symbol);
    const currency = raw.meta?.currency ?? entry?.currency ?? 'USD';

    // Twelve Data returns newest first. Every chart in the app reads left to right,
    // so reversing here is cheaper than every caller remembering to.
    const candles = [...raw.values].reverse().flatMap((v) => {
      const close = money(v.close);
      if (close === null) return [];
      return [{
        // "2026-09-22 15:30:00" parses in Chrome and is Invalid Date in Safari,
        // which then throws the moment a chart formats an axis tick. ISO is what
        // every browser agrees on.
        t: v.datetime.includes(' ') ? v.datetime.replace(' ', 'T') : v.datetime,
        openMinor: money(v.open) ?? close,
        highMinor: money(v.high) ?? close,
        lowMinor: money(v.low) ?? close,
        closeMinor: close,
        volume: v.volume === undefined || v.volume === null ? null : Number(v.volume),
      }];
    });
    if (candles.length === 0) return null;

    // YTD has no interval of its own; it is a daily series cut at January 1st.
    const kept = range === 'YTD'
      ? candles.filter((c) => c.t >= `${new Date().getUTCFullYear()}-01-01`)
      : candles;
    if (kept.length === 0) return null;

    return {
      symbol: symbol.toUpperCase(),
      range,
      currency,
      candles: kept,
      source: this.label,
      asOf: kept[kept.length - 1]!.t,
      simulated: false,
    };
  }

  async profile(symbol: string): Promise<AssetProfile | null> {
    // The free plan has no /profile, but a quote carries the name, exchange and
    // currency — enough for a real header. The curated catalogue fills in the
    // editorial fields (what a fund tracks, its expense ratio) where it knows them,
    // and leaves them null where it does not.
    const raw = await this.get<TdQuote>(`/quote?symbol=${encodeURIComponent(symbol)}`, 3600);
    const entry = catalogEntry(symbol);
    // A failed or rate-limited call is not evidence the instrument does not exist.
    // The catalogue knows VOO is VOO whether or not this minute's quota is spent,
    // and returning null here is what turned a busy minute into a 404.
    if (!raw?.close) {
      if (!entry) return null;
      return {
        symbol: symbol.toUpperCase(),
        name: entry.name,
        kind: entry.kind,
        exchange: entry.exchange ?? null,
        currency: entry.currency,
        description: null,
        sector: entry.sector ?? null,
        industry: entry.industry ?? null,
        country: null,
        website: null,
        expenseRatioBps: entry.expenseRatioBps ?? null,
        tracks: entry.tracks ?? null,
        assetClassNote: null,
      };
    }
    return {
      symbol: symbol.toUpperCase(),
      name: raw.name ?? entry?.name ?? symbol.toUpperCase(),
      kind: entry?.kind ?? kindOf(raw.type),
      exchange: raw.exchange ?? entry?.exchange ?? null,
      currency: raw.currency ?? entry?.currency ?? 'USD',
      description: null,
      sector: entry?.sector ?? null,
      industry: entry?.industry ?? null,
      country: null,
      website: null,
      expenseRatioBps: entry?.expenseRatioBps ?? null,
      tracks: entry?.tracks ?? null,
      assetClassNote: null,
    };
  }

  /** Not on the free plan. Stated as missing rather than guessed at. */
  async fundamentals(_symbol: string): Promise<Fundamentals | null> {
    return null;
  }

  /** Twelve Data has no news endpoint. An empty list, never an invented headline. */
  async news(_symbol: string, _limit?: number): Promise<NewsItem[]> {
    return [];
  }

  /**
   * The whole tradeable universe, not a curated shortlist.
   *
   * This is what stops search from ending at the 69 instruments someone typed into
   * a file by hand. Results are scored only by how well the text matches, because
   * ordering search results by anything price-shaped would be a ranking, and a
   * ranking needs a stated method.
   */
  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const q = query.trim();
    if (q === '') return [];
    const raw = await this.get<{ data?: TdSearchRow[] }>(
      `/symbol_search?symbol=${encodeURIComponent(q)}&outputsize=${limit * 3}`, 3600,
    );
    if (!raw?.data?.length) return [];

    const seen = new Set<string>();
    const out: SearchResult[] = [];
    for (const row of raw.data) {
      const symbol = row.symbol?.toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      const name = row.instrument_name ?? symbol;
      out.push({
        symbol,
        name,
        kind: kindOf(row.instrument_type),
        exchange: row.exchange ?? null,
        score: textScore(q, symbol, name),
        matched: highlight(q, symbol, name),
      });
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => b.score - a.score);
  }
}

/* ---------------- shaping ---------------- */

interface TdQuote {
  symbol?: string; name?: string; exchange?: string; currency?: string; type?: string;
  datetime?: string; timestamp?: number;
  open?: string; high?: string; low?: string; close?: string; previous_close?: string;
  change?: string; percent_change?: string;
}

interface TdSeries {
  meta?: { symbol?: string; interval?: string; currency?: string };
  values?: { datetime: string; open?: string; high?: string; low?: string; close?: string; volume?: string }[];
}

interface TdSearchRow {
  symbol?: string; instrument_name?: string; exchange?: string;
  instrument_type?: string; country?: string; currency?: string;
}

/** A decimal string to minor units, without ever becoming a float we keep. */
function money(value: string | undefined | null): bigint | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return BigInt(Math.round(n * 100));
}

function toQuote(symbol: string, raw: TdQuote, source: string): Quote | null {
  const price = money(raw.close);
  if (price === null) return null;
  const entry = catalogEntry(symbol);
  const pct = raw.percent_change === undefined ? null : Number(raw.percent_change);
  return {
    symbol: symbol.toUpperCase(),
    priceMinor: price,
    currency: raw.currency ?? entry?.currency ?? 'USD',
    changeMinor: money(raw.change),
    changeBps: pct === null || !Number.isFinite(pct) ? null : Math.round(pct * 100),
    previousCloseMinor: money(raw.previous_close),
    dayHighMinor: money(raw.high),
    dayLowMinor: money(raw.low),
    source,
    asOf: raw.datetime ?? new Date().toISOString(),
    simulated: false,
  };
}

function kindOf(instrumentType: string | undefined): AssetKind {
  const t = (instrumentType ?? '').toLowerCase();
  if (t.includes('etf') || t.includes('fund') || t.includes('trust')) return 'etf';
  if (t.includes('digital') || t.includes('crypto')) return 'crypto';
  return 'stock';
}

/** How well the text matches, on the same 0..1 scale the local catalogue uses. */
function textScore(query: string, symbol: string, name: string): number {
  const q = query.trim().toLowerCase();
  const s = symbol.toLowerCase();
  const n = name.toLowerCase();
  if (s === q) return 1;
  if (s.startsWith(q)) return 0.85;
  if (n.startsWith(q)) return 0.8;
  if (n.includes(q)) return 0.6;
  if (s.includes(q)) return 0.5;
  return 0.35;
}

function highlight(query: string, symbol: string, name: string): SearchResult['matched'] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const inSymbol = symbol.toLowerCase().indexOf(q);
  if (inSymbol >= 0) return [{ field: 'symbol', start: inSymbol, end: inSymbol + q.length }];
  const inName = name.toLowerCase().indexOf(q);
  if (inName >= 0) return [{ field: 'name', start: inName, end: inName + q.length }];
  return [];
}

/**
 * Interval and depth per range.
 *
 * `revalidate` is longer for longer ranges because a five-year weekly series does
 * not change minute to minute, and the free plan's 8-requests-a-minute ceiling is
 * spent far too easily by refetching one.
 */
const PLAN: Record<HistoryRange, { interval: string; outputsize: number; revalidate: number }> = {
  '1D': { interval: '5min', outputsize: 78, revalidate: 300 },
  '5D': { interval: '30min', outputsize: 65, revalidate: 900 },
  '1M': { interval: '1day', outputsize: 23, revalidate: 3600 },
  '6M': { interval: '1day', outputsize: 130, revalidate: 3600 },
  'YTD': { interval: '1day', outputsize: 260, revalidate: 3600 },
  '1Y': { interval: '1day', outputsize: 253, revalidate: 3600 },
  '5Y': { interval: '1week', outputsize: 261, revalidate: 21600 },
  'MAX': { interval: '1month', outputsize: 600, revalidate: 86400 },
};

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

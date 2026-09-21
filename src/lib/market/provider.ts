import 'server-only';

/**
 * Market data, behind one interface.
 *
 * The app must be fully usable before anyone has an API key — that is its default
 * state — so the watchlist, the profiling and every screen are built against this
 * interface, and the provider is swapped by an environment variable. Adding a key
 * later changes a config value, not a line of UI code.
 *
 * Nothing here decides what anyone should buy. It fetches prices.
 */

export interface Quote {
  symbol: string;
  /** Last traded price in MINOR units of `currency`, so it never becomes a float. */
  priceMinor: bigint;
  currency: string;
  /** Change against the previous close, in minor units. Null when not reported. */
  changeMinor: bigint | null;
  /** Change as basis points (100 = 1%), so the percentage is exact too. */
  changeBps: number | null;
  /** When the provider says this price is from. */
  asOf: string;
  /** True when this is illustrative rather than real market data. */
  simulated: boolean;
}

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string | null;
}

export interface MarketProvider {
  readonly id: 'finnhub' | 'sample';
  readonly label: string;
  /** False for the sample provider, so every screen can say so plainly. */
  readonly live: boolean;
  quote(symbol: string): Promise<Quote | null>;
  quotes(symbols: string[]): Promise<Quote[]>;
  search(query: string): Promise<SymbolMatch[]>;
}

/* ---------------- Finnhub ---------------- */

/**
 * Finnhub's free tier allows 60 requests a minute, which is ample for a personal
 * watchlist once quotes are cached. Prices are reported in the instrument's own
 * currency; this adapter does not convert, because a silent conversion at an
 * unstated rate is worse than showing the native currency.
 */
class FinnhubProvider implements MarketProvider {
  readonly id = 'finnhub' as const;
  readonly label = 'Finnhub';
  readonly live = true;

  constructor(private readonly apiKey: string) {}

  private async get<T>(path: string): Promise<T | null> {
    try {
      const res = await fetch(`https://finnhub.io/api/v1${path}&token=${this.apiKey}`, {
        // Quotes are cached briefly: a watchlist refreshed on every render would
        // burn the rate limit within a minute of normal use.
        next: { revalidate: 60 },
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  async quote(symbol: string): Promise<Quote | null> {
    const data = await this.get<{ c: number; d: number | null; dp: number | null; t: number }>(
      `/quote?symbol=${encodeURIComponent(symbol)}`,
    );
    // Finnhub returns c: 0 for an unknown symbol rather than an error.
    if (!data || !data.c) return null;
    return {
      symbol: symbol.toUpperCase(),
      priceMinor: BigInt(Math.round(data.c * 100)),
      currency: 'USD',
      changeMinor: data.d === null ? null : BigInt(Math.round(data.d * 100)),
      changeBps: data.dp === null ? null : Math.round(data.dp * 100),
      asOf: new Date((data.t || Date.now() / 1000) * 1000).toISOString(),
      simulated: false,
    };
  }

  async quotes(symbols: string[]): Promise<Quote[]> {
    // Finnhub has no batch quote endpoint on the free tier, so these go in
    // parallel and failures drop out rather than failing the whole list.
    const results = await Promise.all(symbols.map((s) => this.quote(s)));
    return results.filter((q): q is Quote => q !== null);
  }

  async search(query: string): Promise<SymbolMatch[]> {
    const data = await this.get<{ result?: { symbol: string; description: string; type: string }[] }>(
      `/search?q=${encodeURIComponent(query)}`,
    );
    return (data?.result ?? [])
      .filter((r) => r.type === 'Common Stock' || r.type === 'ETP' || r.type === 'ETF')
      .slice(0, 8)
      .map((r) => ({ symbol: r.symbol, name: r.description, exchange: null }));
  }
}

/* ---------------- Sample ---------------- */

/**
 * Illustrative prices, for when no key is configured.
 *
 * Every quote it returns is flagged `simulated: true`, and the UI is required to
 * say so wherever one appears. Showing invented prices that look real would be
 * the single most harmful thing this feature could do.
 *
 * Prices are derived deterministically from the symbol and the date, so the same
 * symbol looks consistent within a day and moves between days — enough to exercise
 * the interface honestly, without pretending to be a market.
 */
class SampleProvider implements MarketProvider {
  readonly id = 'sample' as const;
  readonly label = 'Sample data (no market key configured)';
  readonly live = false;

  private static readonly KNOWN: Record<string, { name: string; base: number }> = {
    VOO: { name: 'Vanguard S&P 500 ETF', base: 512 },
    VTI: { name: 'Vanguard Total Stock Market ETF', base: 279 },
    VXC: { name: 'Vanguard FTSE Global All Cap ex Canada', base: 62 },
    XEQT: { name: 'iShares Core Equity ETF Portfolio', base: 34 },
    VBAL: { name: 'Vanguard Balanced ETF Portfolio', base: 30 },
    AAPL: { name: 'Apple Inc.', base: 232 },
    MSFT: { name: 'Microsoft Corporation', base: 430 },
    GOOGL: { name: 'Alphabet Inc.', base: 168 },
  };

  async quote(symbol: string): Promise<Quote | null> {
    const key = symbol.toUpperCase();
    const known = SampleProvider.KNOWN[key];
    // Unknown symbols return nothing, exactly as a real provider would. Inventing a
    // price for any string typed in would let people build a watchlist of tickers
    // that do not exist and only discover it when real data is switched on.
    if (!known) return null;
    const base = known.base;
    const drift = ((hash(key + new Date().toISOString().slice(0, 10)) % 800) - 400) / 10000;
    const price = base * (1 + drift);

    return {
      symbol: key,
      priceMinor: BigInt(Math.round(price * 100)),
      currency: 'USD',
      changeMinor: BigInt(Math.round(base * drift * 100)),
      changeBps: Math.round(drift * 10000),
      asOf: new Date().toISOString(),
      simulated: true,
    };
  }

  async quotes(symbols: string[]): Promise<Quote[]> {
    const out = await Promise.all(symbols.map((s) => this.quote(s)));
    return out.filter((q): q is Quote => q !== null);
  }

  async search(query: string): Promise<SymbolMatch[]> {
    const q = query.trim().toUpperCase();
    if (q === '') return [];
    return Object.entries(SampleProvider.KNOWN)
      .filter(([symbol, v]) => symbol.includes(q) || v.name.toUpperCase().includes(q))
      .slice(0, 8)
      .map(([symbol, v]) => ({ symbol, name: v.name, exchange: 'SAMPLE' }));
  }
}

/** A small stable hash, so sample prices are consistent rather than random. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/* ---------------- Selection ---------------- */

let cached: MarketProvider | undefined;

export function getMarketProvider(): MarketProvider {
  if (cached) return cached;
  const key = process.env.FINNHUB_API_KEY?.trim();
  cached = key ? new FinnhubProvider(key) : new SampleProvider();
  return cached;
}

/** Test seam: lets a suite install a provider without touching the environment. */
export function __setMarketProvider(provider: MarketProvider | undefined): void {
  cached = provider;
}

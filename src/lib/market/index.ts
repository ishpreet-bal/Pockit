import 'server-only';
import { FinnhubSource } from './finnhub';
import { TwelveDataSource } from './twelvedata';
import { SampleSource } from './sample';
import type { MarketDataSource } from './types';

export * from './types';
export { searchCatalog } from './search';
export { searchAll } from './search-all';
export {
  CATALOG, COLLECTIONS, CATALOG_REVIEWED, catalogEntry, collectionsFor, entriesIn, entriesOfKind,
} from './catalog';
export type { CatalogEntry, Collection } from './catalog';

let cached: MarketDataSource | undefined;

/**
 * The one place that decides where market data comes from.
 *
 * Every screen reads through this, so connecting a real provider is a config change
 * rather than a code change — and there is exactly one place to check when asking
 * "is what I am looking at real?".
 */
export function marketData(): MarketDataSource {
  if (cached) return cached;
  // Twelve Data first: its free tier is the only one of the three that serves
  // historical candles, and a section built around charts is not much use without
  // them. Finnhub stays supported so an existing key keeps working.
  const twelve = process.env.TWELVEDATA_API_KEY?.trim();
  if (twelve) {
    cached = new TwelveDataSource(twelve);
    return cached;
  }
  const finnhub = process.env.FINNHUB_API_KEY?.trim();
  cached = finnhub ? new FinnhubSource(finnhub) : new SampleSource();
  return cached;
}

/** Test seam: install a source without touching the environment. */
export function __setMarketData(source: MarketDataSource | undefined): void {
  cached = source;
}

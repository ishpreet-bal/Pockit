import 'server-only';
import { searchCatalog } from './search';
import { marketData } from './index';
import type { SearchResult } from './types';

/**
 * Search across everything, curated results first.
 *
 * Two sources, deliberately unequal:
 *
 *  - The local catalogue answers instantly, offline, and knows the things a provider
 *    cannot: that "s&p" means the index funds, that "aple" is a typo for Apple. It is
 *    small, and that is fine — it is an editorial layer, not the universe.
 *  - The provider answers for the other tens of thousands of instruments, which is
 *    what stops search from having a ceiling.
 *
 * Curated hits keep their place at the top because they encode intent rather than
 * string similarity: typing "s&p" should not return a company whose name happens to
 * contain those characters. Below that first group, provider results fill in.
 *
 * If the provider is slow or rate-limited, the catalogue result is still returned.
 * A slower complete answer is worse than a fast partial one when someone is typing.
 */
export async function searchAll(query: string, limit = 10): Promise<SearchResult[]> {
  const local = searchCatalog(query, limit);
  const source = marketData();
  if (typeof source.search !== 'function') return local;

  const remote = await withTimeout(source.search(query, limit), 2500, [] as SearchResult[]);

  const seen = new Set(local.map((r) => r.symbol.toUpperCase()));
  const merged = [...local];
  for (const row of remote) {
    const key = row.symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
    if (merged.length >= limit) break;
  }
  return merged;
}

/** Resolve with a fallback rather than hanging a keystroke on a slow provider. */
async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

import { CATALOG, type CatalogEntry } from './catalog';
import type { SearchResult } from './types';

/**
 * Searching for an instrument the way people actually type.
 *
 * The old search required an exact, correctly-cased ticker, which meant you had to
 * already know the answer to find it. This scores every entry against the query and
 * returns the best matches, so "nv" finds NVIDIA, "nvidia" finds NVDA, "s&p" finds
 * the S&P 500 funds and "aple" still finds Apple.
 *
 * It runs over a catalogue of a few dozen entries, so a linear scan is genuinely the
 * right algorithm — an index would be more code, more to keep in sync, and slower to
 * reach the first result.
 */

/** Scoring tiers, highest first. Kept as named constants so ordering is legible. */
const EXACT_SYMBOL = 1.0;
const SYMBOL_PREFIX = 0.9;
const NAME_PREFIX = 0.8;
const ALIAS_PREFIX = 0.78;
const WORD_PREFIX = 0.7;
const NAME_CONTAINS = 0.5;
const SYMBOL_CONTAINS = 0.45;
const FUZZY = 0.3;

/**
 * Normalises a query for comparison.
 *
 * Punctuation is stripped so "s&p 500", "S&P500" and "sp 500" all reduce to the same
 * thing — that single behaviour is most of what makes the search feel forgiving.
 */
function normalise(input: string): string {
  return input
    .toLowerCase()
    // "S and P" is a reasonable thing to type for "S&P". Folding the spelled-out
    // form into the symbol before stripping punctuation means both spellings, and
    // "S&P 500", all reduce to the same key.
    .replace(/\s+and\s+/g, '&')
    .replace(/[^a-z0-9]/g, '');
}

/** Levenshtein distance, capped: beyond `max` the exact value does not matter. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      row.push(value);
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length]!;
}

function scoreEntry(entry: CatalogEntry, raw: string, norm: string): { score: number; field: 'symbol' | 'name' } | null {
  const symbolNorm = normalise(entry.symbol);
  const name = entry.name.toLowerCase();
  const nameNorm = normalise(entry.name);

  if (symbolNorm === norm) return { score: EXACT_SYMBOL, field: 'symbol' };
  if (symbolNorm.startsWith(norm)) return { score: SYMBOL_PREFIX, field: 'symbol' };
  if (nameNorm.startsWith(norm)) return { score: NAME_PREFIX, field: 'name' };

  for (const alias of entry.aliases ?? []) {
    const a = normalise(alias);
    if (a === norm || a.startsWith(norm)) return { score: ALIAS_PREFIX, field: 'name' };
  }

  // "total stock" should find "Vanguard Total Stock Market ETF" — a match on any
  // word boundary, not only the first word.
  if (name.split(/\s+/).some((word) => normalise(word).startsWith(norm))) {
    return { score: WORD_PREFIX, field: 'name' };
  }

  if (nameNorm.includes(norm)) return { score: NAME_CONTAINS, field: 'name' };
  if (symbolNorm.includes(norm)) return { score: SYMBOL_CONTAINS, field: 'symbol' };

  // Typo tolerance, and only for queries long enough that a near-miss is meaningful.
  // One edit for short queries, two for longer: "aple" -> Apple, "microsft" -> Microsoft.
  if (norm.length >= 4) {
    const allowance = norm.length >= 7 ? 2 : 1;
    if (editDistance(norm, symbolNorm, allowance) <= allowance) return { score: FUZZY, field: 'symbol' };
    const firstWord = normalise(name.split(/\s+/)[0] ?? '');
    if (editDistance(norm, firstWord, allowance) <= allowance) return { score: FUZZY, field: 'name' };
    for (const alias of entry.aliases ?? []) {
      if (editDistance(norm, normalise(alias), allowance) <= allowance) return { score: FUZZY, field: 'name' };
    }
  }

  // An unmatched trailing word should not sink an otherwise good match:
  // "vanguard s&p" is two useful tokens.
  if (raw.includes(' ')) {
    const tokens = raw.split(/\s+/).map(normalise).filter((t) => t.length > 1);
    if (tokens.length > 1 && tokens.every((t) => nameNorm.includes(t) || symbolNorm.includes(t))) {
      return { score: NAME_CONTAINS, field: 'name' };
    }
  }

  return null;
}

/** Where the match sits in the displayed text, so the UI can highlight it. */
function highlight(text: string, query: string): { start: number; end: number }[] {
  const lower = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (q === '') return [];
  const at = lower.indexOf(q);
  if (at >= 0) return [{ start: at, end: at + q.length }];
  // Fall back to the first word that starts with the query.
  let offset = 0;
  for (const word of text.split(/(\s+)/)) {
    if (word.toLowerCase().startsWith(q)) return [{ start: offset, end: offset + q.length }];
    offset += word.length;
  }
  return [];
}

export function searchCatalog(query: string, limit = 8): SearchResult[] {
  const raw = query.trim().toLowerCase();
  const norm = normalise(query);
  if (norm === '') return [];

  const scored: { entry: CatalogEntry; score: number; field: 'symbol' | 'name' }[] = [];
  for (const entry of CATALOG) {
    const hit = scoreEntry(entry, raw, norm);
    if (hit) scored.push({ entry, score: hit.score, field: hit.field });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Ties break towards the shorter symbol, which is almost always the better known.
    return a.entry.symbol.length - b.entry.symbol.length;
  });

  return scored.slice(0, limit).map(({ entry, score, field }) => ({
    symbol: entry.symbol,
    name: entry.name,
    kind: entry.kind,
    exchange: entry.exchange,
    score,
    matched: highlight(field === 'symbol' ? entry.symbol : entry.name, query)
      .map((m) => ({ field, start: m.start, end: m.end })),
  }));
}

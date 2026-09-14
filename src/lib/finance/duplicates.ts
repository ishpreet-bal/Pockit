/**
 * Duplicate detection (spec §11).
 *
 * This is deliberately NOT an AI feature. A user asked to merge two financial records
 * needs to see why the system thinks they are the same, and the same pair must always
 * score the same. So: a pure function with published weights, returning both a score
 * and the reasons behind it.
 *
 * The same purchase legitimately arrives through several routes — a bank screenshot,
 * the credit-card statement, and a CSV export — so this runs on every import.
 */
import { absMinor } from '@/lib/money';
import type { IsoDate } from './types';
import { diffDays } from './period';

export interface DuplicateSubject {
  id?: string;
  postedDate: IsoDate;
  amountMinor: bigint;
  merchantName: string | null;
  description: string;
  accountId: string | null;
  source?: string;
  importId?: string | null;
}

export interface DuplicateReason {
  factor: 'amount' | 'date' | 'merchant' | 'account' | 'description' | 'source';
  detail: string;
  points: number;
}

export interface DuplicateMatch {
  candidateId: string;
  /** 0-100. */
  score: number;
  reasons: DuplicateReason[];
  confidence: 'certain' | 'likely' | 'possible' | 'unlikely';
}

/**
 * Weights. These are tuned so that the canonical case — same amount, same day, same
 * merchant, same account — lands at ~98, and so that amount alone can never exceed
 * the "possible" threshold: two $12.00 coffees on different days are not duplicates.
 */
const W = {
  amountExact: 40,
  amountNear: 20,
  dateExact: 25,
  dateWithin1: 20,
  dateWithin3: 12,
  dateWithin5: 5,
  merchantExact: 20,
  merchantStrong: 15,
  merchantWeak: 7,
  accountSame: 10,
  accountUnknown: 3,
  descriptionStrong: 5,
  differentSource: 3,
} as const;

/**
 * Beyond this many days apart, two transactions are never the same one. Five days
 * covers weekend batching and the gap between a purchase and its statement posting.
 */
const MAX_DAY_GAP = 5;

const THRESHOLD_CERTAIN = 90;
const THRESHOLD_LIKELY = 72;
const THRESHOLD_POSSIBLE = 50;

/** Score one candidate against one existing transaction. */
export function scorePair(a: DuplicateSubject, b: DuplicateSubject): DuplicateMatch {
  const reasons: DuplicateReason[] = [];
  let score = 0;

  /* Amount — the strongest single signal. */
  const amountA = absMinor(a.amountMinor);
  const amountB = absMinor(b.amountMinor);
  if (amountA === amountB) {
    score += W.amountExact;
    reasons.push({ factor: 'amount', detail: 'Identical amount', points: W.amountExact });
  } else {
    const diff = amountA > amountB ? amountA - amountB : amountB - amountA;
    const larger = amountA > amountB ? amountA : amountB;
    // Within 1% or 2 cents covers rounding differences between a statement and an app.
    if (larger > 0n && (diff * 100n <= larger || diff <= 2n)) {
      score += W.amountNear;
      reasons.push({ factor: 'amount', detail: 'Amounts differ by under 1%', points: W.amountNear });
    } else {
      // Different amounts: this is not the same transaction. Stop here.
      return {
        candidateId: b.id ?? '',
        score: 0,
        reasons: [{ factor: 'amount', detail: 'Different amounts', points: 0 }],
        confidence: 'unlikely',
      };
    }
  }

  /* Date — statements post a day or two after the purchase. */
  const dayGap = Math.abs(diffDays(a.postedDate, b.postedDate));

  // The date is a GATE, not merely a contributor. The same purchase arriving from
  // two sources always posts within a few days; beyond that it is a different
  // purchase that happens to match. Without this, two identical $5.25 coffees three
  // weeks apart score as a likely duplicate on amount + merchant + account alone.
  if (dayGap > MAX_DAY_GAP) {
    return {
      candidateId: b.id ?? '',
      score: 0,
      reasons: [{ factor: 'date', detail: `${dayGap} days apart — too far to be the same transaction`, points: 0 }],
      confidence: 'unlikely',
    };
  }

  if (dayGap === 0) {
    score += W.dateExact;
    reasons.push({ factor: 'date', detail: 'Same date', points: W.dateExact });
  } else if (dayGap === 1) {
    score += W.dateWithin1;
    reasons.push({ factor: 'date', detail: '1 day apart', points: W.dateWithin1 });
  } else if (dayGap <= 3) {
    score += W.dateWithin3;
    reasons.push({ factor: 'date', detail: `${dayGap} days apart`, points: W.dateWithin3 });
  } else {
    score += W.dateWithin5;
    reasons.push({ factor: 'date', detail: `${dayGap} days apart`, points: W.dateWithin5 });
  }

  /* Merchant — normalised, then fuzzy. */
  const mA = normalizeMerchant(a.merchantName ?? a.description);
  const mB = normalizeMerchant(b.merchantName ?? b.description);
  if (mA && mB) {
    if (mA === mB) {
      score += W.merchantExact;
      reasons.push({ factor: 'merchant', detail: 'Same merchant', points: W.merchantExact });
    } else {
      const sim = similarity(mA, mB);
      if (sim >= 0.85) {
        score += W.merchantStrong;
        reasons.push({ factor: 'merchant', detail: `Merchant ${Math.round(sim * 100)}% similar`, points: W.merchantStrong });
      } else if (sim >= 0.6) {
        score += W.merchantWeak;
        reasons.push({ factor: 'merchant', detail: `Merchant ${Math.round(sim * 100)}% similar`, points: W.merchantWeak });
      } else {
        reasons.push({ factor: 'merchant', detail: 'Different merchant', points: 0 });
      }
    }
  }

  /* Account. */
  if (a.accountId && b.accountId) {
    if (a.accountId === b.accountId) {
      score += W.accountSame;
      reasons.push({ factor: 'account', detail: 'Same account', points: W.accountSame });
    } else {
      reasons.push({ factor: 'account', detail: 'Different account', points: 0 });
    }
  } else {
    score += W.accountUnknown;
    reasons.push({ factor: 'account', detail: 'Account not specified', points: W.accountUnknown });
  }

  /* Description similarity, as a tiebreaker. */
  const dSim = similarity(normalizeMerchant(a.description), normalizeMerchant(b.description));
  if (dSim >= 0.8) {
    score += W.descriptionStrong;
    reasons.push({ factor: 'description', detail: 'Descriptions closely match', points: W.descriptionStrong });
  }

  /* Arriving from a different source is mild evidence of re-import, not of a new purchase. */
  if (a.source && b.source && a.source !== b.source) {
    score += W.differentSource;
    reasons.push({ factor: 'source', detail: `Imported from a different source (${b.source})`, points: W.differentSource });
  }

  const clamped = Math.max(0, Math.min(100, score));
  return {
    candidateId: b.id ?? '',
    score: clamped,
    reasons,
    confidence: confidenceFor(clamped),
  };
}

export function confidenceFor(score: number): DuplicateMatch['confidence'] {
  if (score >= THRESHOLD_CERTAIN) return 'certain';
  if (score >= THRESHOLD_LIKELY) return 'likely';
  if (score >= THRESHOLD_POSSIBLE) return 'possible';
  return 'unlikely';
}

/** The best match for a candidate among existing transactions, if any is plausible. */
export function findDuplicate(
  candidate: DuplicateSubject,
  existing: readonly DuplicateSubject[],
): DuplicateMatch | null {
  let best: DuplicateMatch | null = null;
  for (const e of existing) {
    if (e.id && e.id === candidate.id) continue;
    const match = scorePair(candidate, e);
    if (match.score < THRESHOLD_POSSIBLE) continue;
    if (!best || match.score > best.score) best = match;
  }
  return best;
}

/**
 * Duplicates WITHIN one import — the same transaction appearing in overlapping video
 * frames, or listed twice on a statement page boundary.
 */
export function findInternalDuplicates(
  candidates: readonly (DuplicateSubject & { id: string })[],
): Map<string, DuplicateMatch> {
  const out = new Map<string, DuplicateMatch>();
  const kept: (DuplicateSubject & { id: string })[] = [];
  for (const c of candidates) {
    const match = findDuplicate(c, kept);
    if (match && match.score >= THRESHOLD_LIKELY) out.set(c.id, match);
    else kept.push(c);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* String helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * Strip the noise banks add: store numbers, cities, reference ids, card suffixes.
 * "SHELL #4021 TORONTO ON" and "Shell Oil 4021" both become "shell".
 */
export function normalizeMerchant(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.toLowerCase();
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/\b(pos|purchase|payment|debit|credit|visa|mastercard|interac|e-?transfer|pre-?auth|recurring)\b/g, ' ');
  s = s.replace(/#\s*\d+/g, ' ');
  s = s.replace(/\b\d{4,}\b/g, ' ');
  s = s.replace(/\bx{2,}\d+\b/g, ' ');
  s = s.replace(/\b(inc|llc|ltd|corp|co|company|the)\b/g, ' ');
  s = s.replace(/[^a-z0-9 ]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Trailing province/state codes.
  s = s.replace(/\b(on|qc|bc|ab|mb|sk|ns|nb|nl|pe|nt|yt|nu|ca|us|ny|tx|wa)$/g, '').trim();
  return s;
}

/** Dice coefficient over character bigrams: cheap, order-tolerant, good for names. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };

  const ga = bigrams(a);
  const gb = bigrams(b);
  let intersection = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (const n of ga.values()) sizeA += n;
  for (const n of gb.values()) sizeB += n;
  for (const [g, n] of ga) {
    const m = gb.get(g);
    if (m) intersection += Math.min(n, m);
  }
  return (2 * intersection) / (sizeA + sizeB);
}

/** Who owes what on a split, per person. Pure, so it is tested on its own. */

/** "Sam, Priya and Jo" → ["Sam", "Priya", "Jo"]. */
export function splitNames(withWhom: string | null | undefined): string[] {
  return (withWhom ?? '').split(/\s*(?:,|&|\+|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}
export const personKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

interface ShareLike {
  /** Everyone else's part of the purchase, before any paybacks. */
  othersMinor: number;
  withWhom: string | null;
  repayments: { amountMinor: number; person: string | null }[];
}

/**
 * What each named person still owes on a split. Everyone else's part is divided
 * between the names (to the cent); a payback from a named person comes off theirs,
 * and one recorded for the whole split comes off whoever still owes, evenly.
 */
export function perPerson(share: ShareLike): { name: string; amountMinor: number }[] {
  const names = splitNames(share.withWhom);
  const who = names.length ? names : ['Not named'];
  const base = Math.floor(share.othersMinor / who.length);
  let extra = share.othersMinor - base * who.length;
  const left = who.map((name) => ({ name, amountMinor: base + (extra-- > 0 ? 1 : 0) }));

  let general = 0;
  for (const r of share.repayments) {
    const i = r.person ? left.findIndex((p) => personKey(p.name) === personKey(r.person!)) : -1;
    if (i >= 0) {
      const take = Math.min(left[i]!.amountMinor, r.amountMinor);
      left[i]!.amountMinor -= take;
      general += r.amountMinor - take; // paid more than their part: the rest helps the others
    } else general += r.amountMinor;
  }
  // Spread the rest one cent at a time, round-robin, so it lands evenly and exactly.
  while (general > 0 && left.some((p) => p.amountMinor > 0)) {
    const owing = left.filter((p) => p.amountMinor > 0);
    const each = Math.max(1, Math.floor(general / owing.length));
    for (const p of owing) {
      const take = Math.min(p.amountMinor, each, general);
      p.amountMinor -= take; general -= take;
      if (general === 0) break;
    }
  }
  return left;
}

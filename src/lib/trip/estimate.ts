import 'server-only';
import data from './vehicles-data.json';

/**
 * "Can't find my car": estimate fuel use from what a person knows about it (year,
 * engine size, body, drivetrain, hybrid or not) using the EPA ratings of real cars
 * like it, instead of a formula. The middle (median) of similar cars is robust to
 * the odd sports trim, and the answer says how many cars it rests on.
 */

type Row = [number, number, string, string, string, number | null, number | null, string, number | null, number | null, string];
const ROWS = data as unknown as Row[];

export type Body = 'car' | 'suv' | 'truck' | 'van';
export interface EstimateInput { year: number; displacementL: number; body: Body; awd: boolean; hybrid: boolean; fuel?: 'regular' | 'premium' | 'diesel' | null }
export interface Estimate {
  city: number; highway: number; matches: number; yearFrom: number; yearTo: number;
  fuel: 'regular' | 'premium' | 'midgrade' | 'diesel';
  /** In plain words, what the estimate rests on. */
  basis: string;
}

const bodyOf = (cls: string): Body | null => {
  if (/pickup/i.test(cls)) return 'truck';
  if (/van/i.test(cls)) return 'van';
  if (/sport utility|special purpose/i.test(cls)) return 'suv';
  if (/cars|two seaters|station wagon/i.test(cls)) return 'car';
  return null;
};
const isAwd = (detail: string, cls: string) => /4-wheel|all-wheel|4wd|awd|part-time 4/i.test(detail) || /4wd/i.test(cls);
const displ = (detail: string) => { const m = /(\d+(?:\.\d+)?)L/.exec(detail); return m ? Number(m[1]) : null; };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const FUEL = { R: 'regular', P: 'premium', M: 'midgrade', D: 'diesel' } as const;
const BODY_WORDS: Record<Body, string> = { car: 'cars', suv: 'SUVs', truck: 'pickups', van: 'vans' };

interface Candidate { year: number; displ: number; body: Body; awd: boolean; hybrid: boolean; city: number; highway: number; fuel: keyof typeof FUEL }
let index: Candidate[] | null = null;
function candidates(): Candidate[] {
  if (index) return index;
  index = [];
  for (const r of ROWS) {
    if (r[7] === 'E' || !r[5] || !r[6]) continue;
    const d = displ(r[4]);
    const body = bodyOf(r[10]);
    if (d === null || !body || !(r[7] in FUEL)) continue;
    index.push({ year: r[1], displ: d, body, awd: isAwd(r[4], r[10]), hybrid: /hybrid/i.test(`${r[3]} ${r[4]}`), city: r[5], highway: r[6], fuel: r[7] as keyof typeof FUEL });
  }
  return index;
}

/** Each pass widens the net: a closer match is better, but an estimate on three cars is a guess. */
const PASSES = [
  { years: 2, displ: 0.15, drive: true },
  { years: 4, displ: 0.3, drive: true },
  { years: 6, displ: 0.3, drive: false },
  { years: 10, displ: 0.55, drive: false },
] as const;

export function estimateFuel(input: EstimateInput): Estimate | null {
  const same = candidates().filter((c) => c.body === input.body && c.hybrid === input.hybrid);
  // The fuel the car takes separates an economy engine from a turbo of the same size.
  const want = input.fuel ? ({ regular: 'R', premium: 'P', diesel: 'D' } as const)[input.fuel] : null;
  const byFuel = want ? same.filter((c) => c.fuel === want || (want === 'R' && c.fuel === 'M')) : same;
  const all = byFuel.length >= 30 ? byFuel : same;
  let found: Candidate[] = [];
  for (const p of PASSES) {
    found = all.filter((c) => Math.abs(c.year - input.year) <= p.years && Math.abs(c.displ - input.displacementL) <= p.displ && (!p.drive || c.awd === input.awd));
    if (found.length >= 8) break;
  }
  if (found.length < 3) return null;
  const fuels = new Map<string, number>();
  for (const f of found) fuels.set(f.fuel, (fuels.get(f.fuel) ?? 0) + 1);
  const fuel = FUEL[[...fuels.entries()].sort((a, b) => b[1] - a[1])[0]![0] as keyof typeof FUEL];
  const yearFrom = Math.min(...found.map((f) => f.year));
  const yearTo = Math.max(...found.map((f) => f.year));
  return {
    city: Math.round(median(found.map((f) => f.city)) * 10) / 10,
    highway: Math.round(median(found.map((f) => f.highway)) * 10) / 10,
    matches: found.length, yearFrom, yearTo, fuel,
    basis: `${found.length} similar ${input.hybrid ? 'hybrid ' : ''}${BODY_WORDS[input.body]} with about a ${input.displacementL.toFixed(1)}L engine, ${yearFrom === yearTo ? yearFrom : `${yearFrom}–${yearTo}`}`,
  };
}

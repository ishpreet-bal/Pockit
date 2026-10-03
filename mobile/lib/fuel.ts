/**
 * How much fuel a drive takes, and what it costs.
 *
 * The inputs are the EPA's city and highway ratings (already "real-world"
 * adjusted — the 5-cycle figures, not the old lab numbers) and the route's
 * distance and driving time. A route's average speed says how much of it is
 * highway: 30 km/h and under is stop-and-go city, 90 km/h and over is open
 * highway, and in between is blended in proportion — the same split the EPA
 * uses for its "combined" number when the route is a typical mix.
 *
 * The biggest source of error is the car and driver, not the maths, so a
 * person's own figure (from the dashboard or from fill-ups) always wins.
 */

export interface Efficiency {
  /** Litres per 100 km in the city, or kWh per 100 km for an electric car. */
  city: number;
  highway: number;
  electric: boolean;
}

export interface TripInput {
  distanceKm: number;
  /** Driving time from the route; used only to judge city vs highway. */
  durationMin: number | null;
  efficiency: Efficiency;
  /** A figure the person entered themselves overrides the ratings. */
  ownPer100km?: number | null;
  /** Price per litre (or per kWh), in dollars. */
  price: number;
  tankLitres?: number | null;
  roundTrip?: boolean;
}

export interface TripResult {
  distanceKm: number;
  highwayShare: number;
  per100km: number;
  /** Litres, or kWh for an electric car. */
  amount: number;
  cost: number;
  /** Stops to refill along the way, starting with a full tank and keeping 15% in reserve. */
  refills: number | null;
  /** How much of one tank the trip uses (1 = a full tank). */
  tanks: number | null;
}

const RESERVE = 0.15;

export function highwayShare(distanceKm: number, durationMin: number | null): number {
  if (!durationMin || durationMin <= 0 || distanceKm <= 0) return 0.45; // the EPA's typical mix
  const kmh = distanceKm / (durationMin / 60);
  return Math.min(1, Math.max(0, (kmh - 30) / 60));
}

export function estimateTrip(input: TripInput): TripResult {
  const distanceKm = input.distanceKm * (input.roundTrip ? 2 : 1);
  const share = highwayShare(input.distanceKm, input.durationMin);
  const { city, highway } = input.efficiency;
  // Fuel used is distance / efficiency per part, so blending happens on consumption (L/100km), which is linear in distance.
  const rated = city * (1 - share) + highway * share;
  const per100km = input.ownPer100km && input.ownPer100km > 0 ? input.ownPer100km : rated;
  const amount = (distanceKm * per100km) / 100;
  const cost = amount * input.price;

  let refills: number | null = null;
  let tanks: number | null = null;
  if (!input.efficiency.electric && input.tankLitres && input.tankLitres > 0) {
    tanks = amount / input.tankLitres;
    const usable = input.tankLitres * (1 - RESERVE);
    refills = amount <= usable ? 0 : Math.ceil((amount - usable) / usable);
  }
  return { distanceKm, highwayShare: share, per100km, amount, cost, refills, tanks };
}

export type Days = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CommuteResult {
  perDay: number;
  perWeek: number;
  /** An average month: 52 weeks over 12 months. */
  perMonth: number;
  perYear: number;
  litresPerWeek: number;
}

/** A there-and-back drive repeated some days a week. */
export function estimateCommute(input: Omit<TripInput, 'roundTrip' | 'tankLitres'> & { daysPerWeek: Days }): CommuteResult {
  const day = estimateTrip({ ...input, roundTrip: true });
  const perWeek = day.cost * input.daysPerWeek;
  return {
    perDay: day.cost,
    perWeek,
    perMonth: (perWeek * 52) / 12,
    perYear: perWeek * 52,
    litresPerWeek: day.amount * input.daysPerWeek,
  };
}

/** Rough tank size when the person hasn't said — the EPA list doesn't carry it. */
export function typicalTank(vehicleClass: string | null | undefined): number {
  const c = (vehicleClass ?? '').toLowerCase();
  if (c.includes('pickup')) return 90;
  if (c.includes('van')) return 75;
  if (c.includes('sport utility')) return c.includes('small') ? 55 : 70;
  if (c.includes('large')) return 65;
  if (c.includes('midsize')) return 55;
  if (c.includes('two seater') || c.includes('minicompact')) return 45;
  return 50;
}

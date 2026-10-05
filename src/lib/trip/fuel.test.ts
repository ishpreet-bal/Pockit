import { describe, expect, it } from 'vitest';
import { estimateCommute, estimateTrip, highwayShare, typicalTank } from './fuel';

const civic = { city: 8.1, highway: 6.4, electric: false };

describe('trip fuel', () => {
  it('treats a fast route as highway and a slow one as city', () => {
    expect(highwayShare(100, 60)).toBe(1);   // 100 km/h
    expect(highwayShare(20, 60)).toBe(0);    // 20 km/h
    expect(highwayShare(60, 60)).toBeCloseTo(0.5);
  });

  it('Toronto → Ottawa in a Civic: about 29 L and $45 at $1.55', () => {
    const r = estimateTrip({ distanceKm: 450, durationMin: 270, efficiency: civic, price: 1.55, tankLitres: 47 });
    expect(r.per100km).toBeCloseTo(6.4, 1);
    expect(r.amount).toBeCloseTo(28.8, 1);
    expect(r.cost).toBeCloseTo(44.64, 1);
    expect(r.refills).toBe(0);
  });

  it('round trip doubles it and needs a stop', () => {
    const r = estimateTrip({ distanceKm: 450, durationMin: 270, efficiency: civic, price: 1.55, tankLitres: 47, roundTrip: true });
    expect(r.amount).toBeCloseTo(57.6, 1);
    expect(r.refills).toBe(1);
  });

  it('uses the person’s own figure when given', () => {
    const r = estimateTrip({ distanceKm: 100, durationMin: 60, efficiency: civic, ownPer100km: 9, price: 2 });
    expect(r.cost).toBeCloseTo(18);
  });

  it('electric cars count kWh and no refills', () => {
    const r = estimateTrip({ distanceKm: 100, durationMin: 60, efficiency: { city: 16, highway: 20, electric: true }, price: 0.15, tankLitres: 50 });
    expect(r.amount).toBeCloseTo(20);
    expect(r.refills).toBeNull();
  });

  it('a commute adds up by week and month', () => {
    const c = estimateCommute({ distanceKm: 50, durationMin: 40, efficiency: civic, price: 1.5, daysPerWeek: 5 });
    // 75 km/h → 75% highway → 6.825 L/100km; 100 km a day → 6.825 L → $10.24
    expect(c.perDay).toBeCloseTo(10.24, 1);
    expect(c.perWeek).toBeCloseTo(51.19, 1);
    expect(c.perMonth).toBeCloseTo(221.8, 0);
  });

  it('guesses a tank by size of car', () => {
    expect(typicalTank('Standard Pickup Trucks 4WD')).toBe(90);
    expect(typicalTank('Compact Cars')).toBe(50);
  });
});

describe('polyline', () => {
  it('decodes Google’s example', async () => {
    const { decodePolyline } = await import('./routing');
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });
});

describe('the app’s copy', () => {
  it('is identical, so phone and server never disagree', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('mobile/lib/fuel.ts', 'utf8')).toBe(readFileSync('src/lib/trip/fuel.ts', 'utf8'));
  });
});

describe('investing lessons', () => {
  it('the app and Pock read the same lessons', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('mobile/data/lessons.ts', 'utf8')).toBe(readFileSync('src/lib/pock/lessons.ts', 'utf8'));
  });
  it('Pock’s learning brief carries every lesson', async () => {
    const { LEARN_BRIEF } = await import('../pock/brief');
    for (const t of ['Stocks', 'Crypto', 'Fees and MERs', 'Which account first?']) expect(LEARN_BRIEF).toContain(`## ${t}`);
  });
});

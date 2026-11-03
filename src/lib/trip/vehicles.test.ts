import { afterEach, describe, expect, it, vi } from 'vitest';
import { makes, models, vehicle, versions, years } from './vehicles';
import data from './vehicles-data.json';
import meta from './vehicles-meta.json';
import { estimateTrip } from './fuel';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bundled EPA catalogue', () => {
  it('has current models and valid consumption with unique IDs', () => {
    expect(meta.count).toBe(data.length);
    expect(meta.maxYear).toBeGreaterThanOrEqual(2026);
    expect(new Set(data.map((r) => r[0])).size).toBe(data.length);
    expect(data.every((r) => Number(r[r[7] === 'E' ? 8 : 5]) > 0 && Number(r[r[7] === 'E' ? 9 : 6]) > 0)).toBe(true);
  });
  it('selects a recent gasoline car without making any provider calls', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-03'));
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    expect(await years()).toContain(2026);
    expect(await makes(2025)).toContain('Toyota');
    expect(await models(2025, 'Toyota')).toContain('Corolla');
    const options = await versions(2025, 'Toyota', 'Corolla');
    const car = await vehicle(options[0]!.id);
    expect(car).toMatchObject({ year: 2025, make: 'Toyota', model: 'Corolla', electric: false });
    expect(car!.detail).toMatch(/Wheel Drive/);
    expect(estimateTrip({ distanceKm: 100, durationMin: 60, price: 1.55, efficiency: car! }).cost).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('has real electric ratings rather than treating MPGe as gasoline', async () => {
    const modelsForTesla = await models(2024, 'Tesla');
    const model = modelsForTesla.find((m) => m.startsWith('Model 3'))!;
    expect(model).toBeTruthy();
    const options = await versions(2024, 'Tesla', model);
    const car = await vehicle(options[0]!.id);
    expect(car?.electric).toBe(true);
    expect(car?.city).toBeGreaterThan(5);
    expect(car?.city).toBeLessThan(50);
  });
  it('rejects unsupported live fuel types instead of pricing hydrogen as gasoline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: '999999', year: '2028', make: 'Example', model: 'Hydrogen', fuelType1: 'Hydrogen' }) }));
    expect(await vehicle(999999)).toBeNull();
  });
});

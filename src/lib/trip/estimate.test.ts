import { describe, expect, it } from 'vitest';
import { estimateFuel } from './estimate';

describe('estimate fuel use for a car not in the list', () => {
  it('a 2015 2.0L front-wheel-drive car lands where compact cars do', () => {
    const e = estimateFuel({ year: 2015, displacementL: 2.0, body: 'car', awd: false, hybrid: false })!;
    expect(e.city).toBeGreaterThan(7); expect(e.city).toBeLessThan(11);
    expect(e.highway).toBeGreaterThan(5); expect(e.highway).toBeLessThan(8);
    expect(e.highway).toBeLessThan(e.city);
    expect(e.matches).toBeGreaterThanOrEqual(8);
  });

  it('a 2018 5.3L 4WD pickup uses far more, and a hybrid far less', () => {
    const truck = estimateFuel({ year: 2018, displacementL: 5.3, body: 'truck', awd: true, hybrid: false })!;
    const hybrid = estimateFuel({ year: 2018, displacementL: 1.8, body: 'car', awd: false, hybrid: true })!;
    expect(truck.city).toBeGreaterThan(13);
    expect(hybrid.city).toBeLessThan(6);
    expect(truck.basis).toMatch(/pickups/);
  });

  it('says plainly when there is nothing to go on', () => {
    expect(estimateFuel({ year: 1985, displacementL: 0.7, body: 'van', awd: true, hybrid: true })).toBeNull();
  });
});

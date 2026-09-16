import { describe, it, expect } from 'vitest';
import { occurrencesBetween, nextOccurrence, manualScheduleToSeries, monthlyCostMinor, type ManualSchedule } from './schedule';

function sched(p: Partial<ManualSchedule>): ManualSchedule {
  return {
    id: 's1', name: 'Rent', amountMinor: 180_000n, currency: 'CAD',
    cadence: 'monthly', interval: 1, dayOfMonth: 1,
    startDate: '2026-09-01', endDate: null,
    type: 'expense', categoryId: null, accountId: null,
    direction: 'outflow', isActive: true,
    ...p,
  };
}

/**
 * The whole point of manual schedules: they work with ZERO transaction history.
 * A new user should be able to say "rent is $1,800 on the 1st" and immediately see it
 * in their calendar, budget and cash-flow projection.
 */
describe('manual schedules work without any history', () => {
  it('projects a monthly bill forward', () => {
    const dates = occurrencesBetween(sched({}), '2026-09-01', '2026-12-31');
    expect(dates).toEqual(['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01']);
  });

  it('handles a bill due on the 31st in short months', () => {
    // February must land on the 28th, not skip the month or spill into March.
    const dates = occurrencesBetween(
      sched({ dayOfMonth: 31, startDate: '2026-12-31' }), '2026-12-01', '2027-03-31',
    );
    expect(dates).toEqual(['2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('supports every cadence the user can choose', () => {
    expect(occurrencesBetween(sched({ cadence: 'weekly' }), '2026-09-01', '2026-09-29'))
      .toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']);

    expect(occurrencesBetween(sched({ cadence: 'biweekly' }), '2026-09-01', '2026-10-13'))
      .toEqual(['2026-09-01', '2026-09-15', '2026-09-29', '2026-10-13']);

    expect(occurrencesBetween(sched({ cadence: 'quarterly' }), '2026-09-01', '2027-06-30'))
      .toEqual(['2026-09-01', '2026-12-01', '2027-03-01', '2027-06-01']);

    expect(occurrencesBetween(sched({ cadence: 'annual' }), '2026-09-01', '2028-12-31'))
      .toEqual(['2026-09-01', '2027-09-01', '2028-09-01']);
  });

  it('supports "every N months"', () => {
    const dates = occurrencesBetween(sched({ cadence: 'monthly', interval: 2 }), '2026-09-01', '2027-03-31');
    expect(dates).toEqual(['2026-09-01', '2026-11-01', '2027-01-01', '2027-03-01']);
  });

  it('supports a custom day interval', () => {
    const dates = occurrencesBetween(sched({ cadence: 'custom', interval: 10 }), '2026-09-01', '2026-10-01');
    expect(dates).toEqual(['2026-09-01', '2026-09-11', '2026-09-21', '2026-10-01']);
  });

  it('stops at an end date', () => {
    const dates = occurrencesBetween(sched({ endDate: '2026-10-15' }), '2026-09-01', '2026-12-31');
    expect(dates).toEqual(['2026-09-01', '2026-10-01']);
  });

  it('finds the next occurrence from today', () => {
    expect(nextOccurrence(sched({}), '2026-09-15')).toBe('2026-10-01');
    expect(nextOccurrence(sched({ dayOfMonth: 28 }), '2026-09-15')).toBe('2026-09-28');
  });

  it('does not iterate day by day for a long-running schedule', () => {
    const started = Date.now();
    const dates = occurrencesBetween(
      sched({ cadence: 'weekly', startDate: '2015-01-01' }), '2026-09-01', '2026-09-30',
    );
    expect(dates.length).toBeGreaterThan(3);
    expect(Date.now() - started).toBeLessThan(50);
  });
});

describe('manual and detected schedules are interchangeable', () => {
  it('converts to the same shape the forecast and calendar consume', () => {
    const series = manualScheduleToSeries(sched({}), '2026-09-15');
    expect(series.nextExpectedDate).toBe('2026-10-01');
    expect(series.direction).toBe('outflow');
    // A schedule the user typed is a fact, not an inference.
    expect(series.confidence).toBe(100);
  });

  it('marks manual income as an inflow', () => {
    const series = manualScheduleToSeries(
      sched({ type: 'income', direction: 'inflow', name: 'Payday' }), '2026-09-15',
    );
    expect(series.kind).toBe('income');
    expect(series.direction).toBe('inflow');
  });
});

describe('monthly equivalent cost', () => {
  it('normalises every cadence', () => {
    expect(monthlyCostMinor(sched({ cadence: 'monthly', amountMinor: 180_000n }))).toBe(180_000n);
    expect(monthlyCostMinor(sched({ cadence: 'annual', amountMinor: 120_000n }))).toBe(10_000n);
    expect(monthlyCostMinor(sched({ cadence: 'quarterly', amountMinor: 30_000n }))).toBe(10_000n);
    expect(monthlyCostMinor(sched({ cadence: 'weekly', amountMinor: 1_200n }))).toBe(5_200n);
  });
});

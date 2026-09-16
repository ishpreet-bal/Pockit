import { describe, it, expect } from 'vitest';
import { computeGoalMath, computeGoalPace, type GoalInput } from './goals';

const TODAY = '2026-09-15';
function goal(p: Partial<GoalInput>): GoalInput {
  return {
    id: 'g', name: 'Vacation', targetMinor: 500_000n, currentMinor: 230_000n,
    targetDate: '2027-01-15', priority: 1, monthlyContributionMinor: 45_000n, ...p,
  };
}

describe('goals react to what is actually happening', () => {
  it('reports being ahead when the real pace beats the requirement', () => {
    const g = goal({});
    const math = computeGoalMath(g, TODAY);
    const pace = computeGoalPace(g, math, 120_000n, TODAY, 'CAD');
    expect(pace.status).toBe('ahead');
    expect(pace.headline).toMatch(/ahead of schedule/i);
  });

  it('reports being behind, in months, at the observed pace', () => {
    const g = goal({});
    const math = computeGoalMath(g, TODAY);
    const pace = computeGoalPace(g, math, 20_000n, TODAY, 'CAD');
    expect(pace.status).toBe('behind');
    expect(pace.headline).toMatch(/late/i);
    expect(pace.projectedDate).toBeTruthy();
  });

  it('offers a concrete, optional suggestion when behind', () => {
    const g = goal({});
    const math = computeGoalMath(g, TODAY);
    const pace = computeGoalPace(g, math, 20_000n, TODAY, 'CAD');
    expect(pace.suggestion).not.toBeNull();
    expect(pace.suggestion!.text).toMatch(/would bring this forward/i);
    expect(pace.suggestion!.extraMonthlyMinor).toBeGreaterThan(0n);
    expect(pace.suggestion!.monthsSaved).toBeGreaterThan(0);
  });

  it('does not nag when the goal is already ahead', () => {
    const g = goal({});
    const math = computeGoalMath(g, TODAY);
    expect(computeGoalPace(g, math, 150_000n, TODAY, 'CAD').suggestion).toBeNull();
  });

  it('says plainly when nothing has gone in', () => {
    const g = goal({ currentMinor: 0n, monthlyContributionMinor: null });
    const math = computeGoalMath(g, TODAY);
    const pace = computeGoalPace(g, math, 0n, TODAY, 'CAD');
    expect(pace.status).toBe('stalled');
    expect(pace.headline).toMatch(/nothing has gone in/i);
  });

  it('handles a goal with no target date without pretending to know a deadline', () => {
    const g = goal({ targetDate: null });
    const math = computeGoalMath(g, TODAY);
    const pace = computeGoalPace(g, math, 50_000n, TODAY, 'CAD');
    expect(pace.status).toBe('no_target');
    expect(pace.headline).toMatch(/you will get there around/i);
  });

  it('recognises a finished goal', () => {
    const g = goal({ currentMinor: 500_000n });
    const math = computeGoalMath(g, TODAY);
    expect(computeGoalPace(g, math, 0n, TODAY, 'CAD').status).toBe('achieved');
  });
});

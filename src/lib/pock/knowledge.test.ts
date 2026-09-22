import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HELP, relevantTo, renderHelp } from './knowledge';

/**
 * The anti-rot tests.
 *
 * In-app help decays the moment a page moves, and the symptom is an assistant
 * confidently sending people to a route that 404s. These make that a failing test
 * instead of a support ticket.
 */
describe('application knowledge stays true', () => {
  it('every route it cites actually exists in the app', () => {
    const root = join(process.cwd(), 'src/app');
    for (const entry of HELP) {
      const segments = entry.route.replace(/^\//, '');
      // Routes live under a route group like (app), so the group is searched for.
      const candidates = [
        join(root, segments, 'page.tsx'),
        join(root, '(app)', segments, 'page.tsx'),
        join(root, '(auth)', segments, 'page.tsx'),
      ];
      expect(
        candidates.some((c) => existsSync(c)),
        `${entry.id} points at ${entry.route}, which no longer exists`,
      ).toBe(true);
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(HELP.map((e) => e.id)).size).toBe(HELP.length);
  });

  it('gives every entry keywords, or it can never be retrieved', () => {
    for (const entry of HELP) {
      expect(entry.keywords.length, `${entry.id} has no keywords`).toBeGreaterThan(2);
      expect(entry.body.trim().length, `${entry.id} has no body`).toBeGreaterThan(80);
    }
  });
});

describe('retrieval finds the right page', () => {
  const cases: [string, string][] = [
    ['How do I create a budget?', 'budget'],
    ['Where do I add recurring bills?', 'recurring'],
    ['How do I add a stock to my watchlist?', 'investing'],
    ['What does available monthly mean?', 'terms'],
    ['How do I delete a transaction?', 'transactions-add'],
    ['Where can I change my income?', 'settings-income'],
    ['How do goals work?', 'goals'],
    ['how do I turn on two factor authentication', 'two-factor'],
    ['can I export my data', 'export-privacy'],
    ['why are the prices blank', 'market-data'],
  ];

  it.each(cases)('%s finds the %s entry', (question, expectedId) => {
    const found = relevantTo(question);
    expect(found.map((e) => e.id)).toContain(expectedId);
  });

  it('returns nothing for a question that is not about the app', () => {
    expect(relevantTo('what is the capital of France')).toHaveLength(0);
  });

  it('sends only what was retrieved, never the whole corpus', () => {
    const rendered = renderHelp(relevantTo('how do I make a budget'));
    expect(rendered).toContain('Budgets');
    // The investing page is irrelevant to that question and must not be included.
    expect(rendered).not.toContain('Investing has its own sections');
  });

  it('renders nothing at all when nothing matched', () => {
    expect(renderHelp([])).toBe('');
  });
});

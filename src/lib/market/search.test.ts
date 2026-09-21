import { describe, it, expect } from 'vitest';
import { searchCatalog } from './search';

const symbols = (q: string) => searchCatalog(q).map((r) => r.symbol);

describe('finding an instrument the way people type', () => {
  it('finds by partial ticker as you type', () => {
    expect(symbols('nv')).toContain('NVDA');
    expect(symbols('n')[0]).toBeDefined();
  });

  it('is case insensitive in both directions', () => {
    expect(symbols('nvidia')).toContain('NVDA');
    expect(symbols('NVIDIA')).toContain('NVDA');
    expect(symbols('NvIdIa')).toContain('NVDA');
    expect(symbols('aapl')).toContain('AAPL');
  });

  it('finds S&P funds however the ampersand is typed', () => {
    for (const q of ['s&p', 'S&P 500', 'sp500', 'S and P']) {
      const found = symbols(q);
      expect(found.length, `"${q}" found nothing`).toBeGreaterThan(0);
    }
    expect(symbols('s&p')).toContain('VOO');
  });

  it('tolerates a typo', () => {
    expect(symbols('aple')).toContain('AAPL');
    expect(symbols('microsft')).toContain('MSFT');
    expect(symbols('amazn')).toContain('AMZN');
  });

  it('searches by company name as well as ticker', () => {
    expect(symbols('coca')).toContain('KO');
    expect(symbols('berkshire')).toContain('BRK.B');
  });

  it('finds crypto by name or symbol', () => {
    expect(symbols('bitcoin')).toContain('BTC');
    expect(symbols('eth')).toContain('ETH');
  });

  it('matches a word in the middle of a fund name', () => {
    expect(symbols('dividend').length).toBeGreaterThan(0);
    expect(symbols('total stock')).toContain('VTI');
  });

  it('ranks an exact ticker first', () => {
    expect(symbols('v')[0]).toBe('V');
    expect(symbols('voo')[0]).toBe('VOO');
  });

  it('returns nothing for an empty or meaningless query', () => {
    expect(searchCatalog('')).toHaveLength(0);
    expect(searchCatalog('   ')).toHaveLength(0);
    expect(searchCatalog('zzzzzqqqq')).toHaveLength(0);
  });

  it('reports where the match is, so it can be highlighted', () => {
    const [first] = searchCatalog('nvid');
    expect(first?.matched.length).toBeGreaterThan(0);
    const m = first!.matched[0]!;
    expect(first!.name.slice(m.start, m.end).toLowerCase()).toBe('nvid');
  });

  it('respects the limit', () => {
    expect(searchCatalog('a', 3).length).toBeLessThanOrEqual(3);
  });
});

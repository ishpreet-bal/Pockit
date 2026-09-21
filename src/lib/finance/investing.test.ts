import { describe, it, expect } from 'vitest';
import {
  buildInvestorProfile, INVESTING_DISCLAIMER, INVESTOR_QUESTIONS,
  type InvestorAnswers,
} from './investing';

const base: InvestorAnswers = {
  experience: 'some',
  horizon: 'over_ten',
  reaction: 'wait',
  hasBuffer: true,
  hasHighInterestDebt: false,
};

describe('what must come before investing', () => {
  it('refuses to suggest a mix while high-interest debt exists', () => {
    const p = buildInvestorProfile({ ...base, hasHighInterestDebt: true });
    expect(p.allocation).toBeNull();
    expect(p.blockers[0]).toMatch(/high-interest debt/i);
    expect(p.reasoning.join(' ')).toMatch(/guaranteed/i);
  });

  it('refuses while there is no cash buffer', () => {
    const p = buildInvestorProfile({ ...base, hasBuffer: false });
    expect(p.allocation).toBeNull();
    expect(p.blockers.join(' ')).toMatch(/buffer/i);
  });

  it('refuses for money needed within three years, whatever the appetite', () => {
    for (const horizon of ['under1', 'one_to_three'] as const) {
      const p = buildInvestorProfile({ ...base, horizon, reaction: 'buy', experience: 'confident' });
      expect(p.allocation, `${horizon} produced an allocation`).toBeNull();
      expect(p.level).toBe('cash');
      expect(p.reasoning.join(' ')).toMatch(/savings question, not an\s+investing one/i);
    }
  });

  it('lists every blocker at once rather than one at a time', () => {
    const p = buildInvestorProfile({
      ...base, hasBuffer: false, hasHighInterestDebt: true, horizon: 'under1',
    });
    expect(p.blockers).toHaveLength(3);
  });
});

describe('the mix reflects the answers', () => {
  it('gives a long horizon and a calm temperament the most stocks', () => {
    const p = buildInvestorProfile({ ...base, horizon: 'over_ten', reaction: 'buy', experience: 'confident' });
    expect(p.allocation?.stocksPct).toBe(90);
    expect(p.level).toBe('growth');
  });

  it('pulls back hard for someone who would sell in a crash', () => {
    const calm = buildInvestorProfile({ ...base, reaction: 'wait' });
    const panicky = buildInvestorProfile({ ...base, reaction: 'sell' });
    expect(panicky.allocation!.stocksPct).toBeLessThan(calm.allocation!.stocksPct);
    // The behavioural point matters more than the arithmetic, so it must be said.
    expect(panicky.reasoning.join(' ')).toMatch(/abandon/i);
  });

  it('is gentler for a complete beginner', () => {
    const novice = buildInvestorProfile({ ...base, experience: 'none' });
    const seasoned = buildInvestorProfile({ ...base, experience: 'confident' });
    expect(novice.allocation!.stocksPct).toBeLessThan(seasoned.allocation!.stocksPct);
  });

  it('always produces a mix that totals exactly 100', () => {
    for (const experience of ['none', 'some', 'confident'] as const) {
      for (const horizon of ['three_to_ten', 'over_ten'] as const) {
        for (const reaction of ['sell', 'wait', 'buy'] as const) {
          const p = buildInvestorProfile({ ...base, experience, horizon, reaction });
          const a = p.allocation!;
          expect(a.stocksPct + a.bondsPct + a.cashPct, `${experience}/${horizon}/${reaction}`).toBe(100);
          expect(a.stocksPct).toBeGreaterThanOrEqual(30);
          expect(a.stocksPct).toBeLessThanOrEqual(90);
        }
      }
    }
  });

  it('never returns a suggestion without explaining it', () => {
    const p = buildInvestorProfile(base);
    expect(p.reasoning.length).toBeGreaterThan(0);
    expect(p.headline.length).toBeGreaterThan(0);
  });
});

describe('scope and disclosure', () => {
  it('never names a security to buy', () => {
    // The suggestion is an asset MIX. If a ticker ever appears in this output, the
    // feature has quietly become something it promised not to be.
    const tickers = /\b(AAPL|MSFT|VOO|VTI|TSLA|NVDA|BTC)\b/;
    for (const experience of ['none', 'some', 'confident'] as const) {
      for (const reaction of ['sell', 'wait', 'buy'] as const) {
        const p = buildInvestorProfile({ ...base, experience, reaction });
        expect(`${p.headline} ${p.reasoning.join(' ')}`).not.toMatch(tickers);
      }
    }
  });

  it('disowns day trading and guarantees in the disclaimer', () => {
    const text = INVESTING_DISCLAIMER.join(' ');
    expect(text).toMatch(/not a financial adviser/i);
    expect(text).toMatch(/day trading/i);
    expect(text).toMatch(/past performance/i);
    expect(text).toMatch(/can lose money/i);
  });

  it('asks about horizon, buffer and debt — the three that can stop it', () => {
    const ids = INVESTOR_QUESTIONS.map((q) => q.id);
    expect(ids).toContain('horizon');
    expect(ids).toContain('hasBuffer');
    expect(ids).toContain('hasHighInterestDebt');
  });
});

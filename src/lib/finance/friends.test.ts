import { describe, expect, it } from 'vitest';
import { perPerson, personKey, splitNames } from './friends';

describe('split with friends', () => {
  it('reads the names people actually type', () => {
    expect(splitNames('Sam, Priya and Jo')).toEqual(['Sam', 'Priya', 'Jo']);
    expect(splitNames('Sam & Priya')).toEqual(['Sam', 'Priya']);
    expect(splitNames('  ')).toEqual([]);
    expect(splitNames(null)).toEqual([]);
    expect(splitNames('Alexandra')).toEqual(['Alexandra']); // "and" inside a name is not a separator
  });

  it('the same person typed differently is one person', () => {
    expect(personKey(' sam ')).toBe(personKey('Sam'));
  });

  it('divides everyone else\'s part between the names, to the cent', () => {
    expect(perPerson({ othersMinor: 9606, withWhom: 'Sam, Priya, Jo', repayments: [] })).toEqual([
      { name: 'Sam', amountMinor: 3202 }, { name: 'Priya', amountMinor: 3202 }, { name: 'Jo', amountMinor: 3202 },
    ]);
    const odd = perPerson({ othersMinor: 1001, withWhom: 'A, B', repayments: [] });
    expect(odd.reduce((t, p) => t + p.amountMinor, 0)).toBe(1001);
    expect(perPerson({ othersMinor: 500, withWhom: null, repayments: [] })).toEqual([{ name: 'Not named', amountMinor: 500 }]);
  });

  it('Sam paying me back clears Sam, not half of Sam and half of Priya', () => {
    expect(perPerson({ othersMinor: 6400, withWhom: 'Sam, Priya', repayments: [{ amountMinor: 3200, person: 'sam' }] }))
      .toEqual([{ name: 'Sam', amountMinor: 0 }, { name: 'Priya', amountMinor: 3200 }]);
  });

  it('a payback for the whole split comes off everyone evenly, and never below zero', () => {
    expect(perPerson({ othersMinor: 6400, withWhom: 'Sam, Priya', repayments: [{ amountMinor: 1000, person: null }] }))
      .toEqual([{ name: 'Sam', amountMinor: 2700 }, { name: 'Priya', amountMinor: 2700 }]);
    const over = perPerson({ othersMinor: 6400, withWhom: 'Sam, Priya', repayments: [{ amountMinor: 5000, person: 'Sam' }] });
    expect(over).toEqual([{ name: 'Sam', amountMinor: 0 }, { name: 'Priya', amountMinor: 1400 }]);
    expect(perPerson({ othersMinor: 6400, withWhom: 'Sam, Priya', repayments: [{ amountMinor: 6400, person: null }] }).every((p) => p.amountMinor === 0)).toBe(true);
  });
});

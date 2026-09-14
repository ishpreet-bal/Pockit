import { describe, it, expect } from 'vitest';
import { parseCsv, inferColumnMapping, detectSourceKind } from './parsers';
import { normalizeDate, normalizeAmount, inferTransactionType } from './normalize';
import { findDuplicate, findInternalDuplicates } from '@/lib/finance/duplicates';

describe('column inference across real bank export shapes', () => {
  it('maps a standard single-amount export', () => {
    const m = inferColumnMapping(['Date', 'Description', 'Amount', 'Balance']);
    expect(m).toMatchObject({ date: 'Date', description: 'Description', amount: 'Amount', balance: 'Balance' });
  });

  it('maps separate debit and credit columns', () => {
    const m = inferColumnMapping(['Transaction Date', 'Details', 'Withdrawals', 'Deposits']);
    expect(m.date).toBe('Transaction Date');
    expect(m.description).toBe('Details');
    expect(m.debit).toBe('Withdrawals');
    expect(m.credit).toBe('Deposits');
  });

  it('maps UK-style headers', () => {
    const m = inferColumnMapping(['Date', 'Narrative', 'Paid out', 'Paid in']);
    expect(m.description).toBe('Narrative');
    expect(m.debit).toBe('Paid out');
    expect(m.credit).toBe('Paid in');
  });
});

describe('parseCsv end to end', () => {
  it('parses a single-amount export', () => {
    const csv = [
      'Date,Description,Amount,Balance',
      '2026-09-10,SHELL #4021 TORONTO ON,-72.18,4120.50',
      '2026-09-09,MCDONALDS #1234,-14.50,4192.68',
      '2026-09-08,PAYROLL DEPOSIT ACME,2315.00,4207.18',
    ].join('\n');

    const result = parseCsv(csv);
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0]).toMatchObject({ date: '2026-09-10', amount: '-72.18' });
    expect(result.columnMapping).toMatchObject({ amount: 'Amount', balance: 'Balance' });
  });

  it('parses separate debit/credit columns and sets direction', () => {
    const csv = [
      'Date,Details,Withdrawals,Deposits',
      '2026-09-10,SHELL #4021,72.18,',
      '2026-09-08,PAYROLL,,2315.00',
    ].join('\n');

    const result = parseCsv(csv);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]!.direction).toBe('debit');
    expect(result.transactions[1]!.direction).toBe('credit');
    expect(result.transactions[1]!.amount).toBe('2315.00');
  });

  it('skips a title preamble and finds the real header row', () => {
    const csv = [
      'MY BANK - Account Statement',
      'Account: ****1234',
      'Period: Sep 1 - Sep 30 2026',
      '',
      'Date,Description,Amount',
      '2026-09-10,SHELL,-72.18',
    ].join('\n');

    const result = parseCsv(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.amount).toBe('-72.18');
  });

  it('ignores rows with no date', () => {
    const csv = ['Date,Description,Amount', ',Orphan row,-5.00', '2026-09-10,Real,-72.18'].join('\n');
    expect(parseCsv(csv).transactions).toHaveLength(1);
  });
});

describe('detectSourceKind', () => {
  it('classifies by mime and extension', () => {
    expect(detectSourceKind('statement.csv', 'text/csv')).toBe('csv');
    expect(detectSourceKind('export.xlsx', 'application/octet-stream')).toBe('xlsx');
    expect(detectSourceKind('statement.pdf', 'application/pdf')).toBe('pdf');
    expect(detectSourceKind('screenshot.png', 'image/png')).toBe('image');
    expect(detectSourceKind('scroll.mp4', 'video/mp4')).toBe('video_frames');
  });
});

describe('the full normalise step on a realistic screenshot extraction', () => {
  // Exactly the example from the spec §9.
  const extracted = [
    { date: 'Sep 10', description: 'Shell', amount: '$72.18' },
    { date: 'Sep 9', description: "McDonald's", amount: '$14.50' },
    { date: 'Sep 8', description: 'Amazon', amount: '$81.27' },
  ];

  it('produces structured records with dates, amounts and types', () => {
    const rows = extracted.map((e) => ({
      date: normalizeDate(e.date, 'mdy', '2026-09-14'),
      amount: normalizeAmount(e.amount, 'CAD'),
      type: inferTransactionType(e.description, false, 'credit'),
    }));

    expect(rows[0]!.date.date).toBe('2026-09-10');
    expect(rows[0]!.amount.minor).toBe(7218n);
    expect(rows[0]!.type.type).toBe('expense');

    expect(rows[1]!.amount.minor).toBe(1450n);
    expect(rows[2]!.amount.minor).toBe(8127n);
  });
});

describe('duplicate detection in an import context', () => {
  const existing = [{
    id: 'tx-1', postedDate: '2026-09-10', amountMinor: 7218n,
    merchantName: 'Shell', description: 'SHELL #4021 TORONTO ON',
    accountId: 'acct-visa', source: 'csv',
  }];

  it('flags the same purchase arriving from a different source', () => {
    const match = findDuplicate({
      postedDate: '2026-09-10', amountMinor: 7218n,
      merchantName: 'Shell', description: 'Shell',
      accountId: 'acct-visa', source: 'image',
    }, existing);

    expect(match).not.toBeNull();
    expect(match!.score).toBeGreaterThanOrEqual(90);
    expect(match!.confidence).toBe('certain');
    // The reasons must be inspectable — a merge is never a black box.
    expect(match!.reasons.some((r) => r.factor === 'amount')).toBe(true);
    expect(match!.reasons.some((r) => r.factor === 'date')).toBe(true);
  });

  it('tolerates a statement posting a day later', () => {
    const match = findDuplicate({
      postedDate: '2026-09-11', amountMinor: 7218n,
      merchantName: 'SHELL OIL 4021', description: 'SHELL OIL 4021',
      accountId: 'acct-visa', source: 'pdf',
    }, existing);
    expect(match!.score).toBeGreaterThanOrEqual(72);
  });

  // Regression: the date must GATE the score, not merely contribute to it. Without
  // that, amount + merchant + account alone (40+20+10+5 = 75) cleared the "likely"
  // threshold and two identical coffees weeks apart were offered as a merge.
  it('does NOT flag two identical coffees on different days', () => {
    const coffees = [{
      id: 'tx-2', postedDate: '2026-09-01', amountMinor: 525n,
      merchantName: 'Tim Hortons', description: 'TIM HORTONS',
      accountId: 'acct-visa', source: 'csv',
    }];
    const match = findDuplicate({
      postedDate: '2026-09-20', amountMinor: 525n,
      merchantName: 'Tim Hortons', description: 'TIM HORTONS',
      accountId: 'acct-visa', source: 'csv',
    }, coffees);
    expect(match).toBeNull();
  });

  it('gates on the date at the boundary', () => {
    const base = {
      id: 'tx-3', postedDate: '2026-09-10', amountMinor: 5000n,
      merchantName: 'Same Shop', description: 'SAME SHOP', accountId: 'a', source: 'csv',
    };
    const at5 = findDuplicate({ ...base, id: undefined, postedDate: '2026-09-15' }, [base]);
    const at6 = findDuplicate({ ...base, id: undefined, postedDate: '2026-09-16' }, [base]);
    expect(at5).not.toBeNull();   // 5 days: still plausibly the same posting
    expect(at6).toBeNull();       // 6 days: a different purchase
  });

  it('never flags different amounts, however similar everything else is', () => {
    const match = findDuplicate({
      postedDate: '2026-09-10', amountMinor: 7219n,
      merchantName: 'Shell', description: 'SHELL #4021 TORONTO ON',
      accountId: 'acct-visa', source: 'csv',
    }, existing);
    // One cent apart is within tolerance, so this is a near-match, not a reject.
    expect(match!.score).toBeGreaterThan(50);

    const different = findDuplicate({
      postedDate: '2026-09-10', amountMinor: 9999n,
      merchantName: 'Shell', description: 'SHELL #4021 TORONTO ON',
      accountId: 'acct-visa', source: 'csv',
    }, existing);
    expect(different).toBeNull();
  });

  it('collapses rows repeated within one file, keeping the first', () => {
    const rows = [
      { id: 'a', postedDate: '2026-09-10', amountMinor: 7218n, merchantName: 'Shell', description: 'Shell', accountId: 'v' },
      { id: 'b', postedDate: '2026-09-10', amountMinor: 7218n, merchantName: 'Shell', description: 'Shell', accountId: 'v' },
      { id: 'c', postedDate: '2026-09-09', amountMinor: 1450n, merchantName: 'McDonalds', description: 'McDonalds', accountId: 'v' },
    ];
    const dupes = findInternalDuplicates(rows);
    expect(dupes.has('b')).toBe(true);
    expect(dupes.has('a')).toBe(false);
    expect(dupes.has('c')).toBe(false);
  });
});

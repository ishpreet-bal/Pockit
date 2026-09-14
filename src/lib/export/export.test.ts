import { describe, it, expect } from 'vitest';
import { toCsv, exportTransactionsCsv } from './index';
import type { LedgerTxn, LedgerCategory, LedgerAccount } from '@/lib/finance/types';

describe('CSV writing', () => {
  it('quotes and escapes correctly', () => {
    const csv = toCsv(['a', 'b'], [['plain', 'has,comma'], ['has "quote"', 'has\nnewline']]);
    expect(csv).toContain('"has,comma"');
    expect(csv).toContain('"has ""quote"""');
    expect(csv).toContain('"has\nnewline"');
  });

  it('neutralises spreadsheet formula injection', () => {
    // A merchant name from an imported statement must never execute in Excel.
    const csv = toCsv(['x'], [['=1+1']]);
    expect(csv).toContain("'=1+1");
    expect(csv).not.toMatch(/(^|,)=1\+1/m);
    for (const dangerous of ['+x', '-x', '@x']) {
      expect(toCsv(['x'], [[dangerous]])).toContain(`'${dangerous}`);
    }
  });

  it('starts with a BOM so Excel reads UTF-8', () => {
    expect(toCsv(['a'], [['é']]).startsWith('﻿')).toBe(true);
  });
});

describe('transaction export', () => {
  const categories: LedgerCategory[] = [
    { id: 'p', parentId: null, name: 'Transportation', slug: 'transportation', kind: 'expense', classification: 'variable', necessity: 'essential', color: null, icon: null },
    { id: 'c', parentId: 'p', name: 'Gas', slug: 'gas', kind: 'expense', classification: 'variable', necessity: 'essential', color: null, icon: null },
  ];
  const accounts: LedgerAccount[] = [{
    id: 'a', name: 'Visa', type: 'credit_card', normalBalance: 'credit', currency: 'CAD',
    openingBalanceMinor: 0n, openingBalanceDate: null, creditLimitMinor: null,
    isActive: true, excludeFromNetWorth: false,
  }];
  const txn: LedgerTxn = {
    id: 't1', accountId: 'a', postedDate: '2026-09-10', description: 'SHELL #4021',
    merchantName: 'Shell', merchantId: null, amountMinor: 7218n, baseAmountMinor: 9744n,
    currency: 'USD', type: 'expense', categoryId: 'c', businessClassification: 'personal',
    isRecurring: false, recurringSeriesId: null, transferGroupId: null, offsetsTransactionId: null,
  };

  it('writes exact decimals, never floats', () => {
    const csv = exportTransactionsCsv([txn], categories, accounts, 'CAD');
    expect(csv).toContain('72.18');
    expect(csv).toContain('97.44');
  });

  it('keeps the original currency alongside the converted amount', () => {
    const csv = exportTransactionsCsv([txn], categories, accounts, 'CAD');
    const row = csv.split('\r\n')[1]!;
    expect(row).toContain('USD');
    expect(row).toContain('CAD');
    // Both the original and the base amount are present, so nothing is lost.
    expect(row).toContain('72.18');
    expect(row).toContain('97.44');
  });

  it('includes the parent category so rollups can be rebuilt', () => {
    const csv = exportTransactionsCsv([txn], categories, accounts, 'CAD');
    expect(csv).toContain('Gas');
    expect(csv).toContain('Transportation');
  });
});

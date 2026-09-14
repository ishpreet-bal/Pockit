/**
 * Net worth (spec §18) and investments (spec §19).
 */
import { sumMinor, mulRatio } from '@/lib/money';
import type { IsoDate, LedgerAccount } from './types';
import type { AccountBalance } from './ledger';

export interface ManualPosition {
  id: string;
  name: string;
  category: string;
  valueMinor: bigint;
  asOf: IsoDate;
  accountId: string | null;
}

export interface NetWorthBreakdownEntry {
  key: string;
  label: string;
  category: string;
  amountMinor: bigint;
  source: 'account' | 'manual';
}

export interface NetWorthResult {
  assetsMinor: bigint;
  liabilitiesMinor: bigint;
  netMinor: bigint;
  assets: NetWorthBreakdownEntry[];
  liabilities: NetWorthBreakdownEntry[];
}

/**
 * Net worth = assets − liabilities.
 *
 * Accounts linked to a manual asset or liability are skipped, so a mortgage entered
 * both as a loan account and as a manual liability is counted once.
 */
export function computeNetWorth(
  accounts: readonly LedgerAccount[],
  balances: readonly AccountBalance[],
  manualAssets: readonly ManualPosition[],
  manualLiabilities: readonly ManualPosition[],
): NetWorthResult {
  const balanceById = new Map(balances.map((b) => [b.accountId, b]));
  const linkedAccountIds = new Set(
    [...manualAssets, ...manualLiabilities].map((p) => p.accountId).filter((v): v is string => Boolean(v)),
  );

  const assets: NetWorthBreakdownEntry[] = [];
  const liabilities: NetWorthBreakdownEntry[] = [];

  for (const account of accounts) {
    if (account.excludeFromNetWorth || !account.isActive) continue;
    if (linkedAccountIds.has(account.id)) continue;
    const balance = balanceById.get(account.id);
    if (!balance) continue;

    if (account.normalBalance === 'credit') {
      if (balance.rawMinor === 0n) continue;
      liabilities.push({
        key: `account:${account.id}`,
        label: account.name,
        category: account.type,
        amountMinor: balance.rawMinor,
        source: 'account',
      });
    } else {
      assets.push({
        key: `account:${account.id}`,
        label: account.name,
        category: account.type,
        amountMinor: balance.rawMinor,
        source: 'account',
      });
    }
  }

  for (const a of manualAssets) {
    assets.push({ key: `asset:${a.id}`, label: a.name, category: a.category, amountMinor: a.valueMinor, source: 'manual' });
  }
  for (const l of manualLiabilities) {
    liabilities.push({ key: `liability:${l.id}`, label: l.name, category: l.category, amountMinor: l.valueMinor, source: 'manual' });
  }

  const assetsTotal = sumMinor(assets.map((a) => a.amountMinor));
  const liabilitiesTotal = sumMinor(liabilities.map((l) => l.amountMinor));

  return {
    assetsMinor: assetsTotal,
    liabilitiesMinor: liabilitiesTotal,
    netMinor: assetsTotal - liabilitiesTotal,
    assets: assets.sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : -1)),
    liabilities: liabilities.sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : -1)),
  };
}

/* ------------------------------------------------------------------ */
/* Investments                                                         */
/* ------------------------------------------------------------------ */

export interface HoldingInput {
  id: string;
  name: string;
  symbol: string | null;
  assetClass: string;
  quantity: string;
  costBasisMinor: bigint;
  currentValueMinor: bigint;
  valueAsOf: IsoDate | null;
}

export interface PortfolioResult {
  investedMinor: bigint;
  currentValueMinor: bigint;
  gainLossMinor: bigint;
  gainLossBps: number;
  allocation: { assetClass: string; valueMinor: bigint; shareBps: number }[];
  holdings: (HoldingInput & { gainLossMinor: bigint; gainLossBps: number; shareBps: number })[];
}

/**
 * Portfolio totals from manually entered values.
 * Current value is a stored figure, not a live price: the `PriceProvider` seam exists
 * so a market-data feed can fill it later without changing this calculation.
 */
export function computePortfolio(holdings: readonly HoldingInput[]): PortfolioResult {
  const invested = sumMinor(holdings.map((h) => h.costBasisMinor));
  const current = sumMinor(holdings.map((h) => h.currentValueMinor));
  const gainLoss = current - invested;

  const byClass = new Map<string, bigint>();
  for (const h of holdings) {
    byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0n) + h.currentValueMinor);
  }

  return {
    investedMinor: invested,
    currentValueMinor: current,
    gainLossMinor: gainLoss,
    gainLossBps: invested > 0n ? Number(mulRatio(gainLoss, 10_000n, invested)) : 0,
    allocation: [...byClass.entries()]
      .map(([assetClass, valueMinor]) => ({
        assetClass,
        valueMinor,
        shareBps: current > 0n ? Number(mulRatio(valueMinor, 10_000n, current)) : 0,
      }))
      .sort((a, b) => (b.valueMinor > a.valueMinor ? 1 : -1)),
    holdings: holdings.map((h) => ({
      ...h,
      gainLossMinor: h.currentValueMinor - h.costBasisMinor,
      gainLossBps: h.costBasisMinor > 0n ? Number(mulRatio(h.currentValueMinor - h.costBasisMinor, 10_000n, h.costBasisMinor)) : 0,
      shareBps: current > 0n ? Number(mulRatio(h.currentValueMinor, 10_000n, current)) : 0,
    })),
  };
}

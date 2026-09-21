import type { AssetKind } from './types';

/**
 * A curated reference catalogue of well-known instruments.
 *
 * This is METADATA, not prices: names, tickers, sectors, what a fund tracks. It
 * changes rarely, it is the same for everyone, and shipping it means search,
 * discovery and every collection work before any API key exists — which is the
 * difference between a feature that degrades gracefully and one that is simply
 * broken without a key.
 *
 * Expense ratios are marked indicative and are only included where they are widely
 * published and stable. They are a starting point for research, not a quote: the
 * UI says so, and links out to the issuer.
 *
 * Prices never appear here. Those come from a data source, with provenance.
 */

export interface CatalogEntry {
  symbol: string;
  name: string;
  kind: AssetKind;
  exchange: string;
  currency: string;
  /** Stocks. */
  sector?: string;
  industry?: string;
  /** ETFs: what it actually tracks, and roughly what it costs. */
  tracks?: string;
  expenseRatioBps?: number;
  /** Collections this belongs to, which is what the discovery pages render. */
  collections: string[];
  /** Extra strings people actually type. "s&p" must find VOO. */
  aliases?: string[];
}

/** Collections, with the plain-language description shown above each list. */
export interface Collection {
  id: string;
  kind: AssetKind;
  label: string;
  blurb: string;
}

export const COLLECTIONS: Collection[] = [
  // Stocks
  { id: 'large_cap', kind: 'stock', label: 'Large companies', blurb: 'The biggest listed companies by market value.' },
  { id: 'technology', kind: 'stock', label: 'Technology', blurb: 'Software, semiconductors and hardware.' },
  { id: 'healthcare', kind: 'stock', label: 'Healthcare', blurb: 'Pharmaceuticals, devices and health services.' },
  { id: 'financials', kind: 'stock', label: 'Financials', blurb: 'Banks, insurers and payment networks.' },
  { id: 'energy', kind: 'stock', label: 'Energy', blurb: 'Oil, gas and energy infrastructure.' },
  { id: 'consumer', kind: 'stock', label: 'Consumer', blurb: 'Retail, food, drink and household names.' },
  { id: 'dividend', kind: 'stock', label: 'Dividend payers', blurb: 'Companies with a long record of paying dividends.' },
  { id: 'canadian', kind: 'stock', label: 'Canadian', blurb: 'Listed in Canada.' },

  // ETFs
  { id: 'broad_market', kind: 'etf', label: 'Broad market', blurb: 'One fund covering a whole market.' },
  { id: 'sp500', kind: 'etf', label: 'S&P 500', blurb: 'Tracking the 500 largest US companies.' },
  { id: 'global', kind: 'etf', label: 'Global', blurb: 'Companies across many countries in one fund.' },
  { id: 'etf_canadian', kind: 'etf', label: 'Canadian', blurb: 'Listed in Canada, often in Canadian dollars.' },
  { id: 'etf_dividend', kind: 'etf', label: 'Dividend', blurb: 'Weighted towards companies paying dividends.' },
  { id: 'bonds', kind: 'etf', label: 'Bonds', blurb: 'Lending rather than owning. Usually steadier, usually lower returns.' },
  { id: 'sector_etf', kind: 'etf', label: 'Sector funds', blurb: 'A single slice of the market. Less diversified by design.' },
  { id: 'low_cost', kind: 'etf', label: 'Low cost', blurb: 'Indicative expense ratio at or under 0.10% a year.' },

  // Crypto
  { id: 'large_crypto', kind: 'crypto', label: 'Largest', blurb: 'The largest cryptocurrencies by market value.' },
  { id: 'crypto_other', kind: 'crypto', label: 'Others', blurb: 'Smaller and more volatile.' },
];

const S = (
  symbol: string, name: string, exchange: string, sector: string, industry: string,
  collections: string[], aliases?: string[],
): CatalogEntry => ({
  symbol, name, kind: 'stock', exchange, currency: exchange === 'TSX' ? 'CAD' : 'USD',
  sector, industry, collections, aliases,
});

const E = (
  symbol: string, name: string, exchange: string, tracks: string,
  expenseRatioBps: number | undefined, collections: string[], aliases?: string[],
): CatalogEntry => ({
  symbol, name, kind: 'etf', exchange, currency: exchange === 'TSX' ? 'CAD' : 'USD',
  tracks, expenseRatioBps, collections, aliases,
});

const C = (symbol: string, name: string, collections: string[], aliases?: string[]): CatalogEntry => ({
  symbol, name, kind: 'crypto', exchange: 'CRYPTO', currency: 'USD', collections, aliases,
});

export const CATALOG: CatalogEntry[] = [
  /* ---- US large caps ---- */
  S('AAPL', 'Apple Inc.', 'NASDAQ', 'Technology', 'Consumer electronics', ['large_cap', 'technology', 'consumer'], ['apple', 'iphone']),
  S('MSFT', 'Microsoft Corporation', 'NASDAQ', 'Technology', 'Software', ['large_cap', 'technology', 'dividend'], ['microsoft', 'azure']),
  S('NVDA', 'NVIDIA Corporation', 'NASDAQ', 'Technology', 'Semiconductors', ['large_cap', 'technology'], ['nvidia', 'gpu']),
  S('GOOGL', 'Alphabet Inc.', 'NASDAQ', 'Technology', 'Internet services', ['large_cap', 'technology'], ['google', 'alphabet']),
  S('AMZN', 'Amazon.com, Inc.', 'NASDAQ', 'Consumer', 'E-commerce', ['large_cap', 'consumer', 'technology'], ['amazon']),
  S('META', 'Meta Platforms, Inc.', 'NASDAQ', 'Technology', 'Social media', ['large_cap', 'technology'], ['facebook', 'meta', 'instagram']),
  S('TSLA', 'Tesla, Inc.', 'NASDAQ', 'Consumer', 'Automobiles', ['large_cap', 'consumer'], ['tesla']),
  S('AVGO', 'Broadcom Inc.', 'NASDAQ', 'Technology', 'Semiconductors', ['large_cap', 'technology', 'dividend'], ['broadcom']),
  S('AMD', 'Advanced Micro Devices, Inc.', 'NASDAQ', 'Technology', 'Semiconductors', ['technology'], ['amd']),
  S('CRM', 'Salesforce, Inc.', 'NYSE', 'Technology', 'Software', ['large_cap', 'technology'], ['salesforce']),
  S('ADBE', 'Adobe Inc.', 'NASDAQ', 'Technology', 'Software', ['technology'], ['adobe']),
  S('ORCL', 'Oracle Corporation', 'NYSE', 'Technology', 'Software', ['large_cap', 'technology', 'dividend'], ['oracle']),
  S('INTC', 'Intel Corporation', 'NASDAQ', 'Technology', 'Semiconductors', ['technology'], ['intel']),
  S('CSCO', 'Cisco Systems, Inc.', 'NASDAQ', 'Technology', 'Networking', ['technology', 'dividend'], ['cisco']),

  S('JNJ', 'Johnson & Johnson', 'NYSE', 'Healthcare', 'Pharmaceuticals', ['large_cap', 'healthcare', 'dividend'], ['johnson']),
  S('UNH', 'UnitedHealth Group Incorporated', 'NYSE', 'Healthcare', 'Health insurance', ['large_cap', 'healthcare'], ['unitedhealth']),
  S('LLY', 'Eli Lilly and Company', 'NYSE', 'Healthcare', 'Pharmaceuticals', ['large_cap', 'healthcare'], ['lilly']),
  S('PFE', 'Pfizer Inc.', 'NYSE', 'Healthcare', 'Pharmaceuticals', ['healthcare', 'dividend'], ['pfizer']),
  S('ABBV', 'AbbVie Inc.', 'NYSE', 'Healthcare', 'Pharmaceuticals', ['healthcare', 'dividend'], ['abbvie']),

  S('JPM', 'JPMorgan Chase & Co.', 'NYSE', 'Financials', 'Banking', ['large_cap', 'financials', 'dividend'], ['jpmorgan', 'chase']),
  S('V', 'Visa Inc.', 'NYSE', 'Financials', 'Payments', ['large_cap', 'financials'], ['visa']),
  S('MA', 'Mastercard Incorporated', 'NYSE', 'Financials', 'Payments', ['large_cap', 'financials'], ['mastercard']),
  S('BAC', 'Bank of America Corporation', 'NYSE', 'Financials', 'Banking', ['financials', 'dividend'], ['bank of america']),
  S('BRK.B', 'Berkshire Hathaway Inc.', 'NYSE', 'Financials', 'Conglomerate', ['large_cap', 'financials'], ['berkshire', 'buffett']),

  S('XOM', 'Exxon Mobil Corporation', 'NYSE', 'Energy', 'Oil and gas', ['large_cap', 'energy', 'dividend'], ['exxon']),
  S('CVX', 'Chevron Corporation', 'NYSE', 'Energy', 'Oil and gas', ['energy', 'dividend'], ['chevron']),

  S('WMT', 'Walmart Inc.', 'NYSE', 'Consumer', 'Retail', ['large_cap', 'consumer', 'dividend'], ['walmart']),
  S('COST', 'Costco Wholesale Corporation', 'NASDAQ', 'Consumer', 'Retail', ['large_cap', 'consumer', 'dividend'], ['costco']),
  S('PG', 'The Procter & Gamble Company', 'NYSE', 'Consumer', 'Household products', ['large_cap', 'consumer', 'dividend'], ['procter', 'gamble']),
  S('KO', 'The Coca-Cola Company', 'NYSE', 'Consumer', 'Beverages', ['consumer', 'dividend'], ['coca cola', 'coke']),
  S('PEP', 'PepsiCo, Inc.', 'NASDAQ', 'Consumer', 'Beverages', ['consumer', 'dividend'], ['pepsi']),
  S('MCD', "McDonald's Corporation", 'NYSE', 'Consumer', 'Restaurants', ['consumer', 'dividend'], ['mcdonalds']),
  S('NKE', 'NIKE, Inc.', 'NYSE', 'Consumer', 'Apparel', ['consumer', 'dividend'], ['nike']),

  /* ---- Canadian ---- */
  S('RY.TO', 'Royal Bank of Canada', 'TSX', 'Financials', 'Banking', ['canadian', 'financials', 'dividend'], ['royal bank', 'rbc']),
  S('TD.TO', 'The Toronto-Dominion Bank', 'TSX', 'Financials', 'Banking', ['canadian', 'financials', 'dividend'], ['td bank', 'toronto dominion']),
  S('ENB.TO', 'Enbridge Inc.', 'TSX', 'Energy', 'Pipelines', ['canadian', 'energy', 'dividend'], ['enbridge']),
  S('CNR.TO', 'Canadian National Railway Company', 'TSX', 'Industrials', 'Railways', ['canadian', 'dividend'], ['cn rail', 'canadian national']),
  S('SHOP.TO', 'Shopify Inc.', 'TSX', 'Technology', 'E-commerce software', ['canadian', 'technology'], ['shopify']),
  S('BCE.TO', 'BCE Inc.', 'TSX', 'Communications', 'Telecom', ['canadian', 'dividend'], ['bell', 'bce']),

  /* ---- ETFs ---- */
  E('VOO', 'Vanguard S&P 500 ETF', 'NYSEARCA', 'S&P 500 index', 3, ['broad_market', 'sp500', 'low_cost'], ['s&p', 's&p 500', 'sp500', 'vanguard']),
  E('IVV', 'iShares Core S&P 500 ETF', 'NYSEARCA', 'S&P 500 index', 3, ['broad_market', 'sp500', 'low_cost'], ['s&p', 's&p 500', 'ishares']),
  E('SPY', 'SPDR S&P 500 ETF Trust', 'NYSEARCA', 'S&P 500 index', 9, ['broad_market', 'sp500'], ['s&p', 's&p 500', 'spider']),
  E('VTI', 'Vanguard Total Stock Market ETF', 'NYSEARCA', 'The entire US stock market', 3, ['broad_market', 'low_cost'], ['total market', 'vanguard']),
  E('QQQ', 'Invesco QQQ Trust', 'NASDAQ', 'Nasdaq-100 index', 20, ['sector_etf'], ['nasdaq', 'qqq']),
  E('VT', 'Vanguard Total World Stock ETF', 'NYSEARCA', 'Stocks worldwide', 6, ['global', 'broad_market', 'low_cost'], ['world', 'global']),
  E('VXUS', 'Vanguard Total International Stock ETF', 'NASDAQ', 'Stocks outside the US', 5, ['global', 'low_cost'], ['international']),
  E('VEA', 'Vanguard FTSE Developed Markets ETF', 'NYSEARCA', 'Developed markets outside the US', 5, ['global', 'low_cost']),
  E('VWO', 'Vanguard FTSE Emerging Markets ETF', 'NYSEARCA', 'Emerging markets', 8, ['global']),
  E('SCHD', 'Schwab U.S. Dividend Equity ETF', 'NYSEARCA', 'US dividend-paying companies', 6, ['etf_dividend', 'low_cost'], ['dividend']),
  E('VYM', 'Vanguard High Dividend Yield ETF', 'NYSEARCA', 'Higher-yielding US companies', 6, ['etf_dividend', 'low_cost'], ['dividend', 'yield']),
  E('BND', 'Vanguard Total Bond Market ETF', 'NASDAQ', 'US investment-grade bonds', 3, ['bonds', 'low_cost'], ['bond', 'bonds']),
  E('AGG', 'iShares Core U.S. Aggregate Bond ETF', 'NYSEARCA', 'US investment-grade bonds', 3, ['bonds', 'low_cost'], ['bond', 'bonds']),
  E('XLK', 'Technology Select Sector SPDR Fund', 'NYSEARCA', 'US technology sector', 9, ['sector_etf'], ['tech etf']),
  E('XLV', 'Health Care Select Sector SPDR Fund', 'NYSEARCA', 'US healthcare sector', 9, ['sector_etf']),
  E('XLE', 'Energy Select Sector SPDR Fund', 'NYSEARCA', 'US energy sector', 9, ['sector_etf']),
  E('XLF', 'Financial Select Sector SPDR Fund', 'NYSEARCA', 'US financial sector', 9, ['sector_etf']),
  E('XEQT.TO', 'iShares Core Equity ETF Portfolio', 'TSX', 'Global stocks, in one Canadian-listed fund', 20, ['etf_canadian', 'global', 'broad_market'], ['xeqt', 'all equity']),
  E('VFV.TO', 'Vanguard S&P 500 Index ETF', 'TSX', 'S&P 500, Canadian-listed', 9, ['etf_canadian', 'sp500', 'low_cost'], ['vfv', 's&p', 's&p 500']),
  E('VGRO.TO', 'Vanguard Growth ETF Portfolio', 'TSX', '80% stocks, 20% bonds', 24, ['etf_canadian', 'broad_market'], ['vgro']),
  E('VBAL.TO', 'Vanguard Balanced ETF Portfolio', 'TSX', '60% stocks, 40% bonds', 24, ['etf_canadian', 'broad_market'], ['vbal']),
  E('XIC.TO', 'iShares Core S&P/TSX Capped Composite Index ETF', 'TSX', 'The Canadian stock market', 6, ['etf_canadian', 'broad_market', 'low_cost'], ['xic', 'tsx']),

  /* ---- Crypto ---- */
  C('BTC', 'Bitcoin', ['large_crypto'], ['bitcoin', 'btc']),
  C('ETH', 'Ethereum', ['large_crypto'], ['ethereum', 'eth']),
  C('SOL', 'Solana', ['large_crypto'], ['solana']),
  C('XRP', 'XRP', ['large_crypto'], ['ripple']),
  C('ADA', 'Cardano', ['crypto_other'], ['cardano']),
  C('DOGE', 'Dogecoin', ['crypto_other'], ['doge', 'dogecoin']),
  C('AVAX', 'Avalanche', ['crypto_other'], ['avalanche']),
  C('LINK', 'Chainlink', ['crypto_other'], ['chainlink']),
];

const BY_SYMBOL = new Map(CATALOG.map((e) => [e.symbol.toUpperCase(), e]));

export function catalogEntry(symbol: string): CatalogEntry | null {
  return BY_SYMBOL.get(symbol.toUpperCase()) ?? null;
}

export function collectionsFor(kind: AssetKind): Collection[] {
  return COLLECTIONS.filter((c) => c.kind === kind);
}

export function entriesIn(collectionId: string): CatalogEntry[] {
  return CATALOG.filter((e) => e.collections.includes(collectionId));
}

export function entriesOfKind(kind: AssetKind): CatalogEntry[] {
  return CATALOG.filter((e) => e.kind === kind);
}

/**
 * When this reference data was last reviewed.
 *
 * Shown wherever an expense ratio appears, because a fund's costs can change and a
 * number with no date behind it invites more trust than it has earned.
 */
export const CATALOG_REVIEWED = '2026-09';

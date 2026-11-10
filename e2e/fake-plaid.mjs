// A local stand-in for Plaid's sandbox, for testing the whole bank flow without
// Plaid keys or network access: Hosted Link, token exchange, accounts, and
// /transactions/sync with pages, pending items, corrections and removals.
//
// Response shapes follow Plaid's API reference. Point the app at it with
//   PLAID_API_BASE=http://127.0.0.1:4010 PLAID_CLIENT_ID=test PLAID_SECRET=test
// (PLAID_API_BASE is ignored in production builds).
//
// Test hooks (not part of Plaid):
//   GET  /hosted/:token          the "bank sign-in" page; its button finishes Link
//   POST /fake/advance           the bank posts new activity (next sync sees a delta)
//   POST /fake/login-expired     the next call fails with ITEM_LOGIN_REQUIRED
//   GET  /fake/calls             every call received, to check the keys travelled in headers
//   POST /fake/reset             forget test state between runs

import { createServer } from 'node:http';

const PORT = Number(process.env.FAKE_PLAID_PORT ?? 4010);
const BASE = `http://127.0.0.1:${PORT}`;

const today = new Date();
const day = (n) => new Date(today.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const pfc = (primary, detailed) => ({ primary, detailed, confidence_level: 'VERY_HIGH' });

const ACCOUNTS = [
  { account_id: 'acc_chq', name: 'Chequing', official_name: 'Everyday Chequing', mask: '0000', type: 'depository', subtype: 'checking', balances: { current: 2840.17, available: 2790.17, iso_currency_code: 'CAD' } },
  { account_id: 'acc_sav', name: 'Savings', official_name: 'High Interest Savings', mask: '1111', type: 'depository', subtype: 'savings', balances: { current: 6200, available: 6200, iso_currency_code: 'CAD' } },
  { account_id: 'acc_visa', name: 'Visa', official_name: 'Cash Back Visa', mask: '3333', type: 'credit', subtype: 'credit card', balances: { current: 642.55, available: 4357.45, iso_currency_code: 'CAD' } },
];

let n = 0;
const t = (account_id, amount, daysAgo, name, merchant_name, cat, extra = {}) => ({
  transaction_id: `txn_${++n}`, account_id, amount, date: day(daysAgo), authorized_date: day(daysAgo),
  name, merchant_name, iso_currency_code: 'CAD', unofficial_currency_code: null, pending: false, pending_transaction_id: null,
  payment_channel: 'in store', personal_finance_category: cat, ...extra,
});

// Plaid's sign: positive = money leaving the account.
const INITIAL = [
  t('acc_chq', -2315.0, 14, 'ACME CORP PAYROLL', 'Acme Corp', pfc('INCOME', 'INCOME_WAGES')),
  t('acc_chq', -2315.0, 0, 'ACME CORP PAYROLL', 'Acme Corp', pfc('INCOME', 'INCOME_WAGES')),
  t('acc_chq', 1650.0, 9, 'E-TRANSFER RENT PAYMENT', null, pfc('RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT')),
  t('acc_chq', 104.97, 6, 'TORONTO HYDRO ELEC', 'Toronto Hydro', pfc('RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY')),
  t('acc_chq', 85.0, 5, 'ROGERS WIRELESS PAD', 'Rogers', pfc('RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_TELEPHONE')),
  t('acc_chq', 500.0, 4, 'TFR TO SAVINGS 1111', null, pfc('TRANSFER_OUT', 'TRANSFER_OUT_SAVINGS')),
  t('acc_sav', -500.0, 4, 'TFR FROM CHEQUING 0000', null, pfc('TRANSFER_IN', 'TRANSFER_IN_SAVINGS')),
  t('acc_sav', -11.23, 2, 'INTRST PYMNT', null, pfc('INCOME', 'INCOME_INTEREST_EARNED')),
  t('acc_chq', 400.0, 3, 'VISA PAYMENT 3333', null, pfc('LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')),
  t('acc_visa', -400.0, 3, 'PAYMENT - THANK YOU', null, pfc('LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')),
  t('acc_chq', 4.5, 1, 'MONTHLY ACCOUNT FEE', null, pfc('BANK_FEES', 'BANK_FEES_OTHER_BANK_FEES')),
  t('acc_visa', 4.85, 1, 'TIM HORTONS #4412', 'Tim Hortons', pfc('FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE')),
  t('acc_visa', 6.25, 3, 'TIM HORTONS #4412', 'Tim Hortons', pfc('FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE')),
  t('acc_visa', 132.48, 2, 'LOBLAWS #1032', 'Loblaws', pfc('FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES')),
  t('acc_visa', 65.92, 8, 'NOFRILLS JOE\'S #3021', 'No Frills', pfc('FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES')),
  t('acc_visa', 58.1, 6, 'SHELL C04021', 'Shell', pfc('TRANSPORTATION', 'TRANSPORTATION_GAS')),
  t('acc_visa', 23.4, 7, 'UBER* TRIP', 'Uber', pfc('TRANSPORTATION', 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES'), { payment_channel: 'online' }),
  t('acc_visa', 16.49, 10, 'NETFLIX.COM', 'Netflix', pfc('ENTERTAINMENT', 'ENTERTAINMENT_TV_AND_MOVIES'), { payment_channel: 'online' }),
  t('acc_visa', 89.99, 11, 'AMAZON.CA*2K4LM', 'Amazon', pfc('GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES'), { payment_channel: 'online' }),
  t('acc_visa', -24.99, 4, 'AMAZON.CA REFUND', 'Amazon', pfc('GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES'), { payment_channel: 'online' }),
  t('acc_visa', 42.6, 9, 'LCBO/RAO #217', 'LCBO', pfc('FOOD_AND_DRINK', 'FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR')),
  t('acc_visa', 18.77, 12, 'SHOPPERS DRUG MART #0812', 'Shoppers Drug Mart', pfc('MEDICAL', 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS')),
  t('acc_visa', 49.99, 13, 'GOODLIFE CLUBS', 'GoodLife Fitness', pfc('PERSONAL_CARE', 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS')),
  t('acc_visa', 31.5, 5, 'CINEPLEX #1104', 'Cineplex', pfc('ENTERTAINMENT', 'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS')),
  t('acc_visa', 12.4, 2, 'SQ *BLACKBIRD BAKING', 'Blackbird Baking Co', pfc('FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANT')),
  t('acc_visa', 27.0, 3, 'POS 4021 MISC 88213', null, null),
  t('acc_visa', 7.1, 0, 'STARBUCKS 0221', 'Starbucks', pfc('FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE'), { pending: true, transaction_id: 'txn_pending_sbux' }),
  t('acc_visa', 3.35, 6, 'PRESTO FARE', 'Presto', pfc('TRANSPORTATION', 'TRANSPORTATION_PUBLIC_TRANSIT')),
];

// What the next /fake/advance makes the bank report.
const NEXT = () => ({
  added: [
    { ...INITIAL.find((x) => x.transaction_id === 'txn_pending_sbux'), transaction_id: 'txn_sbux_posted', pending: false, pending_transaction_id: 'txn_pending_sbux', date: day(0) },
    t('acc_visa', 21.3, 0, 'SQ *BLACKBIRD BAKING', 'Blackbird Baking Co', pfc('FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANT')),
  ],
  modified: [{ ...INITIAL.find((x) => x.name.startsWith('SHELL')), amount: 61.1 }],
  removed: [{ transaction_id: 'txn_pending_sbux' }, { transaction_id: INITIAL.find((x) => x.name.startsWith('POS 4021')).transaction_id }],
});

const links = new Map(); // link_token → { done, user }
const items = new Map(); // access_token → { item_id, version, removed }
let pendingDelta = null;
let loginExpired = false;
const calls = [];

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const plaidError = (res, status, code, message) => json(res, status, { error_type: 'ITEM_ERROR', error_code: code, error_message: message, request_id: 'fake' });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};

  if (url.pathname.startsWith('/hosted/')) {
    const token = url.pathname.split('/')[2];
    const link = links.get(token);
    if (!link) { res.writeHead(404); return res.end('Unknown link'); }
    if (req.method === 'POST') { link.done = true; if (link.update) loginExpired = false; res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><h1>Connected</h1><p>You can close this page and go back to Pockit.</p>'); }
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(`<!doctype html><meta name=viewport content="width=device-width"><title>Plaid (test)</title>
      <h1>First Platypus Bank (test)</h1><p>Sign-in is simulated.</p>
      <form method=post><button id=continue type=submit>Continue</button></form>`);
  }
  if (url.pathname === '/fake/advance') { pendingDelta = NEXT(); return json(res, 200, { ok: true }); }
  if (url.pathname === '/fake/login-expired') { loginExpired = true; return json(res, 200, { ok: true }); }
  if (url.pathname === '/fake/calls') return json(res, 200, calls);
  if (url.pathname === '/fake/reset') { pendingDelta = null; loginExpired = false; calls.length = 0; return json(res, 200, { ok: true }); }

  // Every real Plaid call: the keys must be present, in the headers, not the body.
  calls.push({ path: url.pathname, headerKeys: Boolean(req.headers['plaid-client-id'] && req.headers['plaid-secret']), bodyHasSecret: 'secret' in body || 'client_id' in body });
  if (!req.headers['plaid-client-id'] || !req.headers['plaid-secret']) return json(res, 400, { error_type: 'INVALID_REQUEST', error_code: 'MISSING_FIELDS', error_message: 'the following required fields are missing: client_id, secret' });

  switch (url.pathname) {
    case '/link/token/create': {
      const token = `link-sandbox-${Math.random().toString(36).slice(2)}`;
      // With access_token this is update mode: the person signs in again to a bank already linked.
      links.set(token, { done: false, user: body.user?.client_user_id, update: Boolean(body.access_token) });
      return json(res, 200, { link_token: token, expiration: new Date(Date.now() + 4 * 3600_000).toISOString(), hosted_link_url: `${BASE}/hosted/${token}`, request_id: 'fake' });
    }
    case '/link/token/get': {
      const link = links.get(body.link_token);
      if (!link) return json(res, 400, { error_code: 'INVALID_LINK_TOKEN', error_message: 'invalid link token' });
      const sessions = link.done && link.update ? [{ link_session_id: 's1', started_at: new Date().toISOString(), finished_at: new Date().toISOString(), results: { item_add_results: [] } }]
        : link.done ? [{ link_session_id: 's1', results: { item_add_results: [{ public_token: `public-sandbox-${body.link_token}`, institution: { name: 'First Platypus Bank', institution_id: 'ins_109508' } }] } }] : [];
      return json(res, 200, { link_token: body.link_token, link_sessions: sessions, request_id: 'fake' });
    }
    case '/item/public_token/exchange': {
      const access = `access-sandbox-${Math.random().toString(36).slice(2)}`;
      items.set(access, { item_id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, version: 0 });
      return json(res, 200, { access_token: access, item_id: items.get(access).item_id, request_id: 'fake' });
    }
    case '/accounts/get': {
      if (!items.has(body.access_token)) return plaidError(res, 400, 'INVALID_ACCESS_TOKEN', 'could not find matching access token');
      if (loginExpired) return plaidError(res, 400, 'ITEM_LOGIN_REQUIRED', 'the login details of this item have changed');
      return json(res, 200, { accounts: ACCOUNTS, item: { item_id: items.get(body.access_token).item_id, institution_id: 'ins_109508' }, request_id: 'fake' });
    }
    case '/transactions/sync': {
      const item = items.get(body.access_token);
      if (!item) return plaidError(res, 400, 'INVALID_ACCESS_TOKEN', 'could not find matching access token');
      if (loginExpired) return plaidError(res, 400, 'ITEM_LOGIN_REQUIRED', 'the login details of this item have changed');
      const count = Math.min(Number(body.count ?? 100), 500);
      // Initial history comes in pages of `count`, as Plaid sends it: page cursors are "p<offset>".
      const cursor = body.cursor ?? '';
      if (!cursor || cursor.startsWith('p')) {
        const offset = cursor ? Number(cursor.slice(1)) : 0;
        const page = INITIAL.slice(offset, offset + Math.min(count, 10));
        const more = offset + page.length < INITIAL.length;
        return json(res, 200, { added: page, modified: [], removed: [], next_cursor: more ? `p${offset + page.length}` : 'v1', has_more: more, transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE', accounts: ACCOUNTS, request_id: 'fake' });
      }
      if (cursor === 'v1' && pendingDelta) {
        const d = pendingDelta; pendingDelta = null;
        return json(res, 200, { ...d, next_cursor: 'v2', has_more: false, transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE', accounts: ACCOUNTS, request_id: 'fake' });
      }
      return json(res, 200, { added: [], modified: [], removed: [], next_cursor: cursor, has_more: false, transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE', accounts: ACCOUNTS, request_id: 'fake' });
    }
    case '/item/remove': {
      items.delete(body.access_token);
      return json(res, 200, { request_id: 'fake' });
    }
    default:
      return json(res, 404, { error_code: 'NOT_FOUND', error_message: `fake Plaid has no ${url.pathname}` });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`fake Plaid on ${BASE}`));

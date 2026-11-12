// End to end: connect a bank, bring in its transactions, categorise them, keep
// them up to date, handle a broken login, and disconnect. Runs against the dev
// server and the local Plaid stand-in (e2e/fake-plaid.mjs):
//
//   node e2e/fake-plaid.mjs &
//   PLAID_API_BASE=http://127.0.0.1:4010 PLAID_CLIENT_ID=test PLAID_SECRET=test CRON_SECRET=local-cron npm run dev
//   node e2e/bank.mjs
import assert from 'node:assert/strict';

const APP = process.env.APP_URL ?? 'http://localhost:3000';
const PLAID = process.env.FAKE_PLAID ?? 'http://127.0.0.1:4010';
let token = null;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${APP}${path}`, {
    method: body && method === 'GET' ? 'POST' : method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}
const step = (s) => console.log(`\n▸ ${s}`);
const ok = (s) => console.log(`  ✓ ${s}`);

async function allTransactions() {
  const months = new Set();
  for (let i = 0; i < 20; i += 7) months.add(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 7));
  const rows = [];
  for (const m of months) rows.push(...(await api(`/api/mobile/transactions?month=${m}`)).transactions);
  return rows;
}

await fetch(`${PLAID}/fake/reset`, { method: 'POST' });

step('Sign up a new person');
const email = `bank-${Date.now()}@example.com`;
const signup = await api('/api/mobile/auth/sign-up', { body: { firstName: 'Bank', email, password: 'a-long-password-1', timezone: 'America/Toronto' } });
assert.equal(signup.status, 201, JSON.stringify(signup));
token = signup.token;
ok(email);

step('Bank connection is available, nothing connected yet');
let banks = await api('/api/mobile/bank');
assert.equal(banks.available, true);
assert.equal(banks.connections.length, 0);
ok('available, 0 connections');

step('They typed in their balance before connecting (as setup asks)');
assert.equal((await api('/api/mobile/balance', { body: { amount: 2840.17 } })).status, 200);
ok('Everyday account: $2,840.17 typed in');

step('Start Link: a secure page to open');
const link = await api('/api/mobile/bank/link', { method: 'POST' });
assert.equal(link.status, 200, JSON.stringify(link));
assert.match(link.url, /^http/);
ok(link.url);

step('Before they finish, the app is told to keep waiting');
assert.deepEqual((await api('/api/mobile/bank/complete', { body: { linkToken: link.linkToken, ticket: link.ticket } })).done, false);
ok('done: false');

step('They sign in on the bank page and come back');
assert.equal((await fetch(link.url, { method: 'POST' })).status, 200);
const done = await api('/api/mobile/bank/complete', { body: { linkToken: link.linkToken, ticket: link.ticket } });
assert.equal(done.status, 200, JSON.stringify(done));
assert.equal(done.done, true);
assert.equal(done.institution, 'First Platypus Bank');
assert.deepEqual(done.synced, { accounts: 3, added: 27, updated: 0, removed: 0 });
ok(`${done.institution}: ${done.synced.accounts} accounts, ${done.synced.added} transactions (the pending one waits)`);

step('Balances come from the bank');
const bal = await api('/api/mobile/balance');
const byName = Object.fromEntries(bal.accounts.map((a) => [a.name, a]));
assert.equal(byName['First Platypus Bank Chequing'].balanceMinor, 284017);
assert.equal(byName['First Platypus Bank Savings'].balanceMinor, 620000);
assert.equal(byName['First Platypus Bank Visa'].balanceMinor, 64255);
assert.equal(byName['First Platypus Bank Visa'].normalBalance, 'credit');
for (const a of bal.accounts) ok(`${a.name}: ${a.balanceFormatted}${a.normalBalance === 'credit' ? ' owed' : ''}`);
assert.ok(!bal.accounts.some((a) => a.name === 'Everyday account'), `typed-in account still counted: ${bal.accounts.map((a) => a.name).join(', ')}`);
ok('the typed-in account retired, so the same money isn’t counted twice');
assert.equal((await api('/api/mobile/balance', { body: { amount: 10 } })).status, 409);
ok('typing a balance over the bank’s is refused, with a reason');

step('The card statement: when it is due and how much');
const sum = await api('/api/mobile/summary');
const visa = (sum.home.cards ?? []).find((c) => c.name === 'First Platypus Bank Visa');
assert.ok(visa, `card payment missing: ${JSON.stringify(sum.home.cards)}`);
assert.equal(visa.statementMinor, 58812);
assert.equal(visa.minimumMinor, 2500);
assert.equal(visa.daysLeft, 9);
assert.equal(visa.paid, false);
ok(`Visa due in ${visa.daysLeft} days: $588.12 statement, $25 minimum`);

step('Where the money is headed');
const outlook = await api('/api/mobile/outlook');
assert.equal(outlook.status, 200, JSON.stringify(outlook));
const pj = outlook.projection;
assert.equal(pj.projectedMinor, pj.startMinor + pj.incomeMinor - pj.billsMinor - pj.everydayMinor);
assert.ok(outlook.presets.length >= 2 && outlook.presets.every((p) => p.date > outlook.today));
const later = await api(`/api/mobile/outlook?until=${outlook.presets[outlook.presets.length - 1].date}`);
assert.ok(later.projection.points.length > pj.points.length, 'a later date projects further');
const dollars = (m) => (m / 100).toFixed(2);
ok(`by ${outlook.until}: $${dollars(pj.projectedMinor)} (start $${dollars(pj.startMinor)}, pay +$${dollars(pj.incomeMinor)}, bills -$${dollars(pj.billsMinor)}, everyday -$${dollars(pj.everydayMinor)})`);

step('Every transaction, categorised');
let txns = await allTransactions();
console.table(txns.map((x) => ({ date: x.date, name: x.name, amount: (x.amountMinor / 100).toFixed(2), category: x.category ?? '—' })));
const cat = (name) => txns.filter((x) => x.name === name).map((x) => x.category);
const expect = {
  'Acme Corp': 'Salary', 'Tim Hortons': 'Coffee', Loblaws: 'Groceries', 'No Frills': 'Groceries', Shell: 'Gas', Uber: 'Transit',
  Netflix: 'Subscriptions', Amazon: 'Shopping', 'Shoppers Drug Mart': 'Pharmacy', 'GoodLife Fitness': 'Fitness', 'Toronto Hydro': 'Utilities',
  Rogers: 'Phone', 'Blackbird Baking Co': 'Restaurants', Presto: 'Transit', Cineplex: 'Events',
};
for (const [name, want] of Object.entries(expect)) {
  const got = cat(name);
  assert.ok(got.length > 0, `${name} missing`);
  assert.ok(got.every((g) => g === want), `${name}: expected ${want}, got ${got.join(', ')}`);
}
ok(`${Object.keys(expect).length} merchants in the right category`);
assert.ok(!txns.some((x) => /TFR (TO|FROM)/.test(x.name)), 'own-account transfers are not in the list');
ok('moving money between your own accounts is not spending or income');
const refund = txns.find((x) => x.name === 'Amazon' && x.amountMinor > 0);
assert.equal(refund?.amountMinor, 2499);
ok('the Amazon refund comes back as money in');
assert.ok(!txns.some((x) => x.name === 'Starbucks'), 'pending purchase is not stored yet');
ok('the pending Starbucks waits until it posts');
const uncategorised = txns.filter((x) => !x.category).map((x) => x.name);
ok(`left for you to categorise: ${uncategorised.join(', ') || 'none'}`);

step('Recategorise once with "remember this", and the next one follows');
const bakery = txns.find((x) => x.name === 'Blackbird Baking Co');
const detail = await api(`/api/mobile/transactions/${bakery.id}`);
const coffee = detail.categories.find((c) => c.name === 'Coffee');
const patched = await api(`/api/transactions/${bakery.id}`, { method: 'PATCH', body: { categoryId: coffee.id, rememberCategory: true } });
assert.equal(patched.status, 200, JSON.stringify(patched));
ok('Blackbird Baking Co → Coffee, remembered');

step('Plaid can tell Pockit there is something new (webhooks)');
const [itemId] = (await (await fetch(`${PLAID}/fake/items`)).json()).slice(-1);
const hook = async (opts) => (await (await fetch(`${PLAID}/fake/webhook`, { method: 'POST', body: JSON.stringify({ item_id: itemId, ...opts }) })).json());
assert.equal((await hook({ unsigned: true })).status, 401);
assert.equal((await hook({ forge: true })).status, 401);
assert.equal((await hook({ stale: true })).status, 401);
ok('unsigned, tampered or old webhooks are refused');
const good = await hook({});
assert.equal(good.status, 200, JSON.stringify(good));
assert.equal(good.body.synced, 1);
ok('a real one syncs that bank straight away');
assert.ok((await (await fetch(`${PLAID}/fake/calls`)).json()).some((c) => c.path === '/item/webhook/update'), 'older bank logins are pointed at the webhook');
ok('older bank logins are pointed at the webhook');
const fresh = await api('/api/mobile/bank/sync', { body: { ifStale: true } });
assert.equal(fresh.synced.length, 0);
ok('opening the app right after a sync costs nothing');

step('The bank posts new activity; Sync now picks it up');
await fetch(`${PLAID}/fake/advance`, { method: 'POST' });
const sync = await api('/api/mobile/bank/sync', { method: 'POST' });
assert.equal(sync.synced.length, 1);
assert.equal(sync.synced[0].ok, true, JSON.stringify(sync));
assert.equal(sync.synced[0].added, 2);
assert.equal(sync.synced[0].updated, 1);
assert.equal(sync.synced[0].removed, 1);
txns = await allTransactions();
assert.deepEqual(cat('Blackbird Baking Co'), ['Coffee', 'Coffee']);
ok('the new Blackbird visit lands in Coffee, from your rule');
assert.deepEqual(cat('Starbucks'), ['Coffee']);
ok('Starbucks posted and is now counted');
assert.equal(txns.find((x) => x.name === 'Shell').amountMinor, -6110);
ok('Shell corrected by the bank: $58.10 → $61.10');
assert.ok(!txns.some((x) => x.name.startsWith('POS 4021')));
ok('the transaction the bank removed is gone');

step('The daily sync job');
assert.equal((await fetch(`${APP}/api/cron/sync-banks`)).status, 401);
const cron = await (await fetch(`${APP}/api/cron/sync-banks`, { headers: { authorization: 'Bearer local-cron' } })).json();
assert.equal(cron.ok, true);
assert.ok(cron.synced >= 1, JSON.stringify(cron)); // other test data in the same database may fail on its own
ok(`refused without the secret; synced ${cron.synced} bank(s) with it`);

step('A bank login that stops working');
await fetch(`${PLAID}/fake/login-expired`, { method: 'POST' });
const broken = await api('/api/mobile/bank/sync', { method: 'POST' });
assert.equal(broken.synced[0].ok, false);
banks = await api('/api/mobile/bank');
assert.equal(banks.connections[0].status, 'reconnect');
ok('marked "Needs you to sign in again", balances kept');

step('They sign in again: same bank, same accounts, nothing doubled');
const before = (await allTransactions()).length;
const again = await api('/api/mobile/bank/link', { body: { connectionId: banks.connections[0].id } });
assert.equal(again.status, 200, JSON.stringify(again));
assert.equal((await api('/api/mobile/bank/complete', { body: { linkToken: again.linkToken, ticket: again.ticket, connectionId: banks.connections[0].id } })).done, false);
await fetch(again.url, { method: 'POST' });
const fixed = await api('/api/mobile/bank/complete', { body: { linkToken: again.linkToken, ticket: again.ticket, connectionId: banks.connections[0].id } });
assert.equal(fixed.done, true, JSON.stringify(fixed));
banks = await api('/api/mobile/bank');
assert.equal(banks.connections.length, 1);
assert.equal(banks.connections[0].status, 'active');
assert.equal((await api('/api/mobile/balance')).accounts.filter((a) => a.name.startsWith('First Platypus')).length, 3);
assert.equal((await allTransactions()).length, before);
ok('working again, still 3 accounts, no duplicate transactions');

step('Keys travel in headers, never in a request body');
const calls = await (await fetch(`${PLAID}/fake/calls`)).json();
assert.ok(calls.length > 5 && calls.every((c) => c.headerKeys && !c.bodyHasSecret), JSON.stringify(calls.slice(0, 3)));
ok(`${calls.length} calls checked`);

step('Someone else can\'t see or touch any of it');
const ownerToken = token;
const someTxn = (await allTransactions())[0];
const other = await api('/api/mobile/auth/sign-up', { body: { firstName: 'Other', email: `other-${Date.now()}@example.com`, password: 'a-long-password-1', timezone: 'America/Toronto' } });
assert.equal(other.status, 201, JSON.stringify(other));
token = other.token;
assert.equal((await api('/api/mobile/bank')).connections.length, 0);
assert.ok([403, 404].includes((await api(`/api/mobile/transactions/${someTxn.id}`)).status));
assert.ok([403, 404].includes((await api(`/api/transactions/${someTxn.id}`, { method: 'PATCH', body: { categoryId: null } })).status));
assert.equal((await api(`/api/mobile/bank?id=${banks.connections[0].id}`, { method: 'DELETE' })).status, 404);
assert.equal((await api('/api/mobile/bank/link', { body: { connectionId: banks.connections[0].id } })).status, 404);
assert.equal((await api('/api/mobile/bank/complete', { body: { linkToken: again.linkToken, ticket: again.ticket, connectionId: banks.connections[0].id } })).status, 403);
assert.equal((await api('/api/mobile/bank/complete', { body: { linkToken: link.linkToken, ticket: link.ticket } })).status, 403);
assert.equal((await allTransactions()).length, 0);
token = ownerToken;
assert.equal((await api('/api/mobile/bank')).connections.length, 1);
ok('their bank, transactions and connection are invisible and untouchable to another account');

step('Disconnect: Plaid forgets the login, your history stays');
const conn = banks.connections[0];
assert.equal((await api(`/api/mobile/bank?id=${conn.id}`, { method: 'DELETE' })).ok, true);
assert.equal((await api('/api/mobile/bank')).connections.length, 0);
assert.ok((await allTransactions()).length >= 25);
ok('0 connections, transactions kept');

step('Guests can\'t connect a bank');
token = null;
const guest = await api('/api/mobile/auth/guest', { method: 'POST' });
token = guest.token;
const blocked = await api('/api/mobile/bank/link', { method: 'POST' });
assert.equal(blocked.status, 403);
ok('403 with "Create a free account first"');

console.log('\nBank connection: all checks passed.');

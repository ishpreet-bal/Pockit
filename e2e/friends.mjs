// Split with friends, end to end: both directions, per person, settling up with
// and without a linked bank payment, and the budget counting each dinner once.
//   node e2e/friends.mjs   (against the dev server; APP_URL to point elsewhere)
import assert from 'node:assert/strict';

const APP = process.env.APP_URL ?? 'http://localhost:3000';
let token = null;
async function api(path, { method, body } = {}) {
  const res = await fetch(`${APP}${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
const step = (s) => console.log(`\n▸ ${s}`);
const ok = (s) => console.log(`  ✓ ${s}`);
const today = new Date().toISOString().slice(0, 10);
const spent = async () => (await api('/api/mobile/summary')).spending.spentMinor;

step('A new person with an everyday account');
const s = await api('/api/mobile/auth/sign-up', { body: { firstName: 'Fran', email: `friends-${Date.now()}@example.com`, password: 'a-long-password-1', timezone: 'America/Toronto' } });
assert.equal(s.status, 201, JSON.stringify(s));
token = s.token;
assert.equal((await api('/api/mobile/balance', { body: { amount: 2000 } })).status, 200);
const account = (await api('/api/mobile/balance')).accounts[0];
ok(`${account.name}: ${account.balanceFormatted}`);

step('Dinner for three on my card, split with Sam and Priya');
const dinner = await api('/api/transactions', { body: { amount: '96.00', description: 'Pai Northern Thai', accountId: account.id, postedDate: today, type: 'expense' } });
assert.ok(dinner.id, JSON.stringify(dinner));
const split = await api(`/api/mobile/transactions/${dinner.id}/share`, { method: 'PUT', body: { kind: 'split', people: 3, expectBack: true, withWhom: 'Sam, Priya' } });
assert.equal(split.status, 200, JSON.stringify(split));
assert.equal(await spent(), 3200);
ok('only my $32 counts as spending');

step('Priya paid for concert tickets; my part was $45');
const cats = (await api('/api/mobile/friends')).categories;
const events = cats.find((c) => c.name === 'Events');
const iou = await api('/api/mobile/friends', { body: { person: 'priya', description: 'Concert tickets', amount: 45, categoryId: events?.id ?? null } });
assert.equal(iou.status, 201, JSON.stringify(iou));
assert.equal(await spent(), 3200 + 4500);
ok('my $45 counts as spending today');

step('Balances per person, both ways');
let f = await api('/api/mobile/friends');
const by = Object.fromEntries(f.people.map((p) => [p.key, p]));
assert.equal(by.sam.netMinor, 3200);
assert.equal(by.priya.owesYouMinor, 3200);
assert.equal(by.priya.youOweMinor, 4500);
assert.equal(by.priya.netMinor, -1300);
assert.equal(by.priya.name, 'Priya'); // typed "priya" the second time, still one person
assert.equal(f.owesYouMinor, 6400);
assert.equal(f.youOweMinor, 4500);
ok('Sam owes me $32 · Priya owes me $32 and I owe her $45, so I owe her $13');

step('Sam pays me back his part');
const samItem = by.sam.items[0];
assert.equal((await api(`/api/mobile/owed/${samItem.id}`, { body: { amount: samItem.amountMinor / 100, person: 'Sam' } })).status, 200);
f = await api('/api/mobile/friends');
assert.ok(!f.people.some((p) => p.key === 'sam'));
assert.equal(f.people.find((p) => p.key === 'priya').owesYouMinor, 3200);
ok('Sam is squared up; Priya still owes her part of dinner');

step('I e-Transfer Priya $45 from my bank, and link it');
const etf = await api('/api/transactions', { body: { amount: '45.00', description: 'e-Transfer to Priya', accountId: account.id, postedDate: today, type: 'expense' } });
f = await api('/api/mobile/friends');
assert.ok(f.payments.some((p) => p.id === etf.id), 'the e-Transfer is offered to link');
assert.equal(await spent(), 3200 + 4500 + 4500);
const debt = f.people.find((p) => p.key === 'priya').items.find((i) => i.kind === 'you-owe');
assert.equal((await api(`/api/mobile/friends/${debt.id}`, { body: { transactionId: etf.id } })).status, 200);
assert.equal(await spent(), 3200 + 4500);
ok('linked: the concert counts once, the e-Transfer is not new spending');
f = await api('/api/mobile/friends');
assert.equal(f.youOweMinor, 0);
assert.equal(f.people.find((p) => p.key === 'priya').netMinor, 3200);
ok('now Priya just owes me $32');
assert.equal((await api(`/api/mobile/friends/${debt.id}`, { body: {} })).status, 400);
ok('paying back twice is refused');

step('An IOU entered by mistake can be removed, with its spending');
const oops = await api('/api/mobile/friends', { body: { person: 'Jo', description: 'Oops', amount: 10 } });
assert.equal(await spent(), 3200 + 4500 + 1000);
assert.equal((await api(`/api/mobile/friends/${oops.id}`, { method: 'DELETE' })).status, 200);
assert.equal(await spent(), 3200 + 4500);
ok('removed, and the $10 is gone from spending');

step('Bad input is refused plainly');
assert.equal((await api('/api/mobile/friends', { body: { person: '', description: 'x', amount: 5 } })).status, 400);
assert.equal((await api('/api/mobile/friends', { body: { person: 'A', description: 'x', amount: -5 } })).status, 400);
ok('no name, or a negative amount, is refused');

step('Nobody else can see or settle it');
const mine = f.people.find((p) => p.key === 'priya').items[0];
token = (await api('/api/mobile/auth/sign-up', { body: { firstName: 'Eve', email: `eve-${Date.now()}@example.com`, password: 'a-long-password-1' } })).token;
assert.equal((await api('/api/mobile/friends')).people.length, 0);
assert.equal((await api(`/api/mobile/friends/${debt.id}`, { method: 'DELETE' })).status, 404);
assert.ok([403, 404].includes((await api(`/api/mobile/owed/${mine.id}`, { body: {} })).status));
ok('another account sees no one and can change nothing');

console.log('\nSplit with friends: all checks passed.');

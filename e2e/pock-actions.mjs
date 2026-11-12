/**
 * What Pock offers to do, once tapped: each action runs through the same endpoint as
 * doing it by hand, re-checks its input, and can't reach another person's data.
 * Needs no AI key: the confirm step is what's tested. Run: node e2e/pock-actions.mjs
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.BASE ?? 'http://localhost:3000';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let n = 0;
const check = (label, value) => { assert.ok(value, label); console.log(`  ✓ ${label}`); n++; };

async function account(label) {
  const ctx = await browser.newContext();
  const { token } = await (await ctx.request.post(`${base}/api/mobile/auth/sign-up`, { data: { firstName: label, email: `pock-${label}-${Date.now()}@example.com`, password: 'correcthorse1' } })).json();
  const headers = { authorization: `Bearer ${token}` };
  await ctx.request.post(`${base}/api/onboarding`, { headers, data: { accounts: [{ name: 'Chequing', type: 'chequing', balance: '1200.00' }, { name: 'Amex Cobalt', type: 'credit_card', balance: '300.00' }] } });
  await ctx.request.post(`${base}/api/onboarding/apply`, { headers });
  const call = async (method, path, data) => { const r = await ctx.request.fetch(`${base}${path}`, { method, headers, data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  return { ctx, call };
}

try {
  const me = await account('me');
  const act = (kind, params) => me.call('POST', '/api/pock/act', { kind, params });
  const accts = (await me.call('GET', '/api/mobile/balance')).body.accounts;
  const chq = accts.find((a) => a.type === 'chequing'); const card = accts.find((a) => a.type === 'credit_card');
  assert.ok(chq && card, JSON.stringify(accts));
  const today = new Date().toISOString().slice(0, 10);

  const purchase = await act('add_purchase', { amount: 14.5, description: 'Tim Hortons', date: today, categoryId: null, accountId: chq.id, income: false });
  check('a purchase Pock offered is added once tapped', purchase.status === 200 && purchase.body.open === '/transactions');
  check('and it is really there', JSON.stringify((await me.call('GET', '/api/mobile/transactions')).body).includes('Tim Hortons'));

  const bill = await act('add_bill', { name: 'Phone', amount: 65, dayOfMonth: 12, categoryId: null });
  check('a bill is added', bill.status === 200 && JSON.stringify((await me.call('GET', '/api/schedules')).body).includes('Phone'));

  const goal = await act('create_goal', { name: 'Japan trip', target: 3000, targetDate: null });
  check('a goal is started', goal.status === 200 && JSON.stringify((await me.call('GET', '/api/mobile/summary')).body.goals).includes('Japan trip'));

  const plan = (await me.call('GET', '/api/mobile/budget')).body.categories;
  const food = plan.find((c) => /restaurant/i.test(c.name)) ?? plan[0];
  const other = plan.find((c) => c.id !== food.id);
  await me.call('POST', '/api/mobile/budget', { lines: [{ categoryId: other.id, amount: 90 }] });
  const budget = await act('set_budget', { categoryId: food.id, categoryName: food.name, amount: 200 });
  const after = (await me.call('GET', '/api/mobile/budget')).body.categories;
  check('a budget line is set', budget.status === 200 && after.find((c) => c.id === food.id)?.planMinor === 20000);
  check('the rest of the budget is kept', after.find((c) => c.id === other.id)?.planMinor === 9000);

  const due = await act('set_card_due_day', { accountId: card.id, day: 21 });
  check('a card due day is saved', due.status === 200 && (await me.call('GET', '/api/mobile/balance')).body.accounts.find((a) => a.id === card.id)?.paymentDueDay === 21);
  check('and the card shows as coming up', ((await me.call('GET', '/api/mobile/summary')).body.home.cards ?? []).some((c) => c.id === card.id));

  check('opening a screen returns where to go', (await act('open_screen', { screen: 'bills' })).body.open === '/bills');
  check('a bad amount is refused', (await act('add_purchase', { amount: -3, description: 'x', date: today, categoryId: null, accountId: chq.id })).status === 400);
  check('an unknown action is refused', (await act('move_money', { amount: 100 })).status === 400);

  const them = await account('them');
  const theirs = (await them.call('GET', '/api/mobile/balance')).body.accounts;
  const foreign = await act('add_purchase', { amount: 5, description: 'Sneaky', date: today, categoryId: null, accountId: theirs[0].id, income: false });
  check('someone else’s account can’t be used', foreign.status >= 400);
  check('someone else’s card can’t be changed', (await act('set_card_due_day', { accountId: theirs.find((a) => a.type === 'credit_card').id, day: 2 })).status === 404);
  console.log(`\n${n} Pock action checks passed.`);
} finally {
  await browser.close();
}

/**
 * Looking around, then signing in to a real account, must show the real account.
 *
 * The bug: "Look around first" on the website leaves a guest cookie, and the app
 * inside the website (/app) shares it. Signing in from there sent the real token as
 * a Bearer header, but the server read the guest cookie first, so sample money kept
 * showing. Run: BASE=http://localhost:3000 node e2e/guest-handoff.mjs
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.BASE ?? 'http://localhost:3000';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let n = 0;
const check = (label, value) => { assert.ok(value, label); console.log(`  ✓ ${label}`); n++; };

try {
  // A real account with nothing in it yet.
  const email = `handoff-${Date.now()}@example.com`;
  const setup = await browser.newContext();
  const made = await (await setup.request.post(`${base}/api/mobile/auth/sign-up`, { data: { firstName: 'Real', email, password: 'correcthorse1' } })).json();
  assert.ok(made.token, 'real account created');
  await setup.close();

  // Someone looks around on the website first: the guest cookie is now in the browser.
  const ctx = await browser.newContext();
  await ctx.request.get(`${base}/demo`, { maxRedirects: 0 }).catch(() => null);
  const cookie = (await ctx.cookies(base)).find((c) => c.name === 'pockit_session');
  check('looking around leaves a guest cookie', Boolean(cookie));
  const guestMe = await (await ctx.request.get(`${base}/api/mobile/me`)).json();
  check('that cookie is a guest with sample money', guestMe.guest === true);

  // Then signs in to their real account inside the app on the same site.
  const signedIn = await (await ctx.request.post(`${base}/api/mobile/auth/sign-in`, { data: { email, password: 'correcthorse1' } })).json();
  check('sign-in works from the guest browser', Boolean(signedIn.token));
  const auth = { headers: { authorization: `Bearer ${signedIn.token}` } };
  const me = await (await ctx.request.get(`${base}/api/mobile/me`, auth)).json();
  check('the app now sees the real account, not the guest', me.guest !== true && me.email === email);
  const list = JSON.stringify(await (await ctx.request.get(`${base}/api/mobile/transactions`, auth)).json());
  check('no sample purchases in the new account', !/Loblaws|Tim Hortons|No Frills/.test(list));
  check('the guest cookie was cleared', !(await ctx.cookies(base)).some((c) => c.name === 'pockit_session' && c.value === cookie.value));
  const old = await browser.newContext();
  await old.addCookies([{ ...cookie }]);
  check('the guest and its sample money are gone', (await old.request.get(`${base}/api/mobile/me`)).status() === 401);
  console.log(`\n${n} guest hand-off checks passed.`);
} finally {
  await browser.close();
}

// Sample money loaded into a real account, then a real purchase on top: removing the
// sample must leave the real purchase alone.
const b2 = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const ctx = await b2.newContext();
  const email = `sample-${Date.now()}@example.com`;
  const { token } = await (await ctx.request.post(`${base}/api/mobile/auth/sign-up`, { data: { firstName: 'Real', email, password: 'correcthorse1' } })).json();
  const auth = { headers: { authorization: `Bearer ${token}` } };
  await ctx.request.post(`${base}/api/onboarding`, { ...auth, data: { accounts: [{ name: 'My chequing', type: 'chequing', balance: '900.00' }] } });
  await ctx.request.post(`${base}/api/onboarding/apply`, auth);
  check('sample money can be loaded', (await ctx.request.post(`${base}/api/demo/seed`, auth)).ok());
  check('the app is told there is sample money', (await (await ctx.request.get(`${base}/api/mobile/me`, auth)).json()).sampleData === true);
  const page = await (await ctx.request.get(`${base}/api/mobile/transactions`, auth)).json();
  const mine = page.accounts?.find((a) => a.name === 'My chequing') ?? page.accounts?.[0];
  const added = await ctx.request.post(`${base}/api/transactions`, { ...auth, data: { amount: '12.34', description: 'My own coffee', accountId: mine?.id, categoryId: null, postedDate: new Date().toISOString().slice(0, 10), type: 'expense' } });
  check('a real purchase is added on top', added.ok());
  check('removing the sample works', (await ctx.request.post(`${base}/api/workspace/clear-demo`, auth)).ok());
  const after = JSON.stringify(await (await ctx.request.get(`${base}/api/mobile/transactions`, auth)).json());
  check('the sample purchases are gone', !/Loblaws|Tim Hortons|No Frills/.test(after));
  check('the real purchase and account stay', /My own coffee/.test(after) && /My chequing/.test(after));
  check('the app is told it is clean', (await (await ctx.request.get(`${base}/api/mobile/me`, auth)).json()).sampleData === false);
  console.log(`\n${n} checks passed in all.`);
} finally {
  await b2.close();
}

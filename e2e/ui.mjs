/**
 * Interface checks for the redesigned shell.
 *
 * These cover the things a unit test cannot see and a human reviewer forgets to
 * re-check: that the dashboard's two time windows never wear one label, that the
 * filters actually filter, that the sheet closes on Escape, that every page still
 * renders after a design pass, and that nothing pushes the page sideways on a phone.
 *
 *   BASE=http://localhost:3000 npm run e2e:ui
 *
 * Expects a signed-up account with demo data loaded (see e2e/smoke.mjs).
 */
import { chromium } from 'playwright';

const B = process.env.BASE ?? 'http://localhost:3000';
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const EMAIL = process.env.E2E_EMAIL ?? 'ish@example.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'correcthorse1';
let fails = 0;
const ok = (n, c, d='') => { console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':' '+d)); if(!c) fails++; };
const b = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message.slice(0,140)));

await p.goto(B+'/sign-in');
await p.fill('#email', EMAIL); await p.fill('#password', PASSWORD);
await p.click('button[type=submit]'); await p.waitForURL(/overview/,{timeout:30000});
await p.waitForTimeout(2200);

console.log('\nDashboard');
const body = await p.textContent('body');
ok('headline is explained, not a bare number', /in cash, minus|Left this month/i.test(body));
ok('"still to pay" is scoped to this month', /bills? this month|nothing left this month/i.test(body));
ok('"coming up" states its 30-day window', /next 30 days/i.test(body));
ok('donut renders', await p.locator('.recharts-surface').count() > 0);
ok('search + filter pills present', await p.locator('input[type=search]').count() > 0 && await p.locator('button:has-text("Discretionary")').count() > 0);

// Filtering actually filters.
const before = await p.locator('section[aria-label="Recent activity"] li').count();
await p.locator('button:has-text("Income")').first().click();
await p.waitForTimeout(400);
const after = await p.locator('section[aria-label="Recent activity"] li').count();
ok('filter pill narrows the list', after > 0 && after < before, `${before} -> ${after}`);
await p.locator('button:has-text("All")').first().click();
await p.fill('input[type=search]','tim hortons');
await p.waitForTimeout(400);
const searched = await p.locator('section[aria-label="Recent activity"] li').count();
ok('search narrows the list', searched > 0 && searched < before, `${searched}`);

console.log('\nQuick add');
ok('FAB is present on the dashboard', await p.locator('button[aria-label="Add transaction"]').count() > 0);
await p.locator('button[aria-label="Add transaction"]').click();
await p.waitForTimeout(600);
ok('FAB opens the add sheet', await p.locator('[role=dialog][aria-label="Add transaction"]').count() > 0);
await p.keyboard.press('Escape');
// The sheet leaves on a spring, so the node lingers while it animates out.
await p.waitForSelector('[role=dialog][aria-label="Add transaction"]', { state: 'detached', timeout: 4000 }).catch(() => {});
ok('Escape closes the sheet', await p.locator('[role=dialog][aria-label="Add transaction"]').count() === 0);

console.log('\nNavigation');
ok('sidebar uses icons, not glyphs', await p.locator('aside svg').count() >= 5);
await p.locator('button[aria-label="Collapse sidebar"]').click();
await p.waitForTimeout(500);
const w = await p.locator('aside').boundingBox();
ok('sidebar collapses', w.width < 100, `${Math.round(w.width)}px`);
await p.locator('button[aria-label="Expand sidebar"]').click();
await p.waitForTimeout(400);

console.log('\nEvery page still renders');
for (const r of ['/transactions','/budget','/goals','/calendar','/recurring','/accounts','/analytics','/forecast','/debts','/business','/assistant','/settings','/imports']) {
  await p.goto(B+r);
  await p.waitForTimeout(700);
  const t = await p.textContent('body');
  ok(r, !/Application error|Something went wrong/i.test(t));
}

console.log('\nMobile (390px)');
const m = await ctx.newPage();
await m.setViewportSize({width:390,height:844});
m.on('pageerror', e => errs.push(e.message.slice(0,140)));
for (const r of ['/overview','/transactions','/budget','/goals','/calendar']) {
  await m.goto(B+r); await m.waitForTimeout(900);
  const of = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`no horizontal overflow on ${r}`, of <= 0, `${of}px`);
}
ok('bottom tab bar is visible', await m.locator('nav[aria-label="Primary"]').isVisible());
ok('FAB clears the tab bar', await (async () => {
  const fab = await m.locator('button[aria-label="Add transaction"]').boundingBox();
  const nav = await m.locator('nav[aria-label="Primary"]').boundingBox();
  return fab && nav && (fab.y + fab.height) < nav.y + 4;
})());

ok('no uncaught client errors', errs.length === 0, errs.slice(0,3).join(' | '));
await b.close();
console.log(`\n${fails === 0 ? 'All checks passed.' : fails + ' check(s) failed.'}`);
process.exit(fails ? 1 : 0);

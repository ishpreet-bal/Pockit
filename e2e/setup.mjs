/**
 * End-to-end test of the first-run path, against an EMPTY database.
 *
 * This exists because the worst failure this app has shipped was not a wrong number:
 * it was a deployment whose database had never been migrated, which answered every
 * page with "Application error: a server-side exception has occurred" and a digest
 * hash. The owner had no way to learn what was wrong. So the contract tested here is
 * that an unfinished deployment always explains itself and offers the fix.
 *
 * Unlike smoke.mjs this one REQUIRES a database with no Pockit tables in it:
 *
 *   createdb pockit_setup
 *   DATABASE_URL=postgres://...pockit_setup ADMIN_SECRET=... npx next start -p 3413
 *   BASE=http://127.0.0.1:3413 ADMIN_SECRET=... npm run e2e:setup
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? '';
/**
 * 'empty'    — a database with no Pockit tables at all (a brand new deployment).
 * 'outdated' — a database migrated to an EARLIER release. This is the case that
 *              actually reached a user: every page 500'd, and because the app only
 *              asked whether *any* migration had run, /setup called it healthy and
 *              bounced them back to the broken page. A partial migration is a broken
 *              database and must be reported as one.
 */
const MODE = process.env.MODE ?? 'empty';

const failures = [];
let checks = 0;

function check(name, condition, detail = '') {
  checks++;
  if (condition) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name} ${detail}`);
    failures.push(`${name} ${detail}`.trim());
  }
}

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const page = await browser.newPage();

console.log(`\nBefore setup (${MODE} database) — the app must explain itself, not crash`);

const health = await (await page.request.get(`${BASE}/api/health`)).json();
check('health does not call a broken deployment ready', health.status === 'degraded', health.status);

if (MODE === 'empty') {
  await page.goto(`${BASE}/sign-up`);
  await page.fill('#email', 'first@example.com');
  await page.fill('#password', 'correcthorse1');
  await page.click('button[type=submit]');
  await page.waitForTimeout(3000);
  const signUpText = await page.textContent('body');
  check('sign-up does not show the generic application error', !/Application error/i.test(signUpText));
  check('sign-up says setup is unfinished', /not finished setting up/i.test(signUpText));
  check('sign-up links to /setup', (await page.locator('a[href="/setup"]').count()) > 0);
} else {
  check('a pending migration is reported', health.pendingMigrations.length > 0, JSON.stringify(health.pendingMigrations));
  check('already-applied migrations are still recorded', health.migrationsApplied.length > 0);
}

await page.goto(`${BASE}/setup`);
check('/setup does not bounce away from a broken deployment', /\/setup$/.test(page.url()), page.url());
const setupText = await page.textContent('body');
check(
  '/setup names the problem',
  MODE === 'empty'
    ? /tables Pockit needs do not exist|completely empty/i.test(setupText)
    : /set up for an older version/i.test(setupText),
);
check(
  '/setup offers the fix',
  MODE === 'empty' ? /Run the one-time setup/i.test(setupText) : /Apply the update/i.test(setupText),
);

await page.fill('input[type=password]', 'definitely-not-the-key');
await page.click('button[type=submit]');
await page.waitForTimeout(2000);
check('a wrong setup key is refused in words', /not correct/i.test(await page.textContent('body')));

console.log('\nRunning setup');

await page.fill('input[type=password]', ADMIN_SECRET);
await page.click('button[type=submit]');
await page.waitForSelector('text=/Setup finished|Update finished/', { timeout: 120000 }).catch(() => {});
check('setup completes', /Setup finished|Update finished/i.test(await page.textContent('body')));

const after = await (await page.request.get(`${BASE}/api/health`)).json();
check('health reports ready', after.status === 'ready', JSON.stringify(after.problems));
check('nothing is left pending', after.pendingMigrations.length === 0, JSON.stringify(after.pendingMigrations));
check('every shipped migration is recorded', after.migrationsApplied.length >= 3);

console.log('\nAfter setup — the app must work');

await page.goto(`${BASE}/sign-up`);
await page.fill('#email', `first-${Date.now()}@example.com`);
await page.fill('#password', 'correcthorse1');
await page.click('button[type=submit]');
await page.waitForURL(/onboarding|overview/, { timeout: 30000 }).catch(() => {});
check('registration succeeds once setup has run', /onboarding|overview/.test(page.url()), page.url());

await page.goto(`${BASE}/overview`);
const overview = await page.textContent('body');
check('the overview page loads', !/Application error|Something went wrong/i.test(overview));

await page.goto(`${BASE}/setup`);
check('/setup steps aside when nothing is wrong', !/\/setup$/.test(page.url()), page.url());

await browser.close();

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

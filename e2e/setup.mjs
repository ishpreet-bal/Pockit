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

console.log('\nBefore setup — the app must explain itself, not crash');

await page.goto(`${BASE}/sign-up`);
await page.fill('#email', 'first@example.com');
await page.fill('#password', 'correcthorse1');
await page.click('button[type=submit]');
await page.waitForTimeout(3000);
const signUpText = await page.textContent('body');
check('sign-up does not show the generic application error', !/Application error/i.test(signUpText));
check('sign-up says setup is unfinished', /not finished setting up/i.test(signUpText));
check('sign-up links to /setup', (await page.locator('a[href="/setup"]').count()) > 0);

await page.goto(`${BASE}/setup`);
const setupText = await page.textContent('body');
check('/setup names the missing tables', /tables Pockit needs do not exist|completely empty/i.test(setupText));
check('/setup offers to run setup', /Run the one-time setup/i.test(setupText));

await page.fill('input[type=password]', 'definitely-not-the-key');
await page.click('button[type=submit]');
await page.waitForTimeout(2000);
check('a wrong setup key is refused in words', /not correct/i.test(await page.textContent('body')));

console.log('\nRunning setup');

await page.fill('input[type=password]', ADMIN_SECRET);
await page.click('button[type=submit]');
await page.waitForSelector('text=Setup finished', { timeout: 120000 }).catch(() => {});
check('setup completes', /Setup finished/i.test(await page.textContent('body')));

const health = await (await page.request.get(`${BASE}/api/health`)).json();
check('health reports ready', health.status === 'ready', JSON.stringify(health.problems));
check('migrations are recorded', health.migrationsApplied.length >= 3);

console.log('\nAfter setup — the app must work');

await page.goto(`${BASE}/sign-up`);
await page.fill('#email', 'first@example.com');
await page.fill('#password', 'correcthorse1');
await page.click('button[type=submit]');
await page.waitForURL(/onboarding|overview/, { timeout: 30000 }).catch(() => {});
check('registration succeeds once setup has run', /onboarding|overview/.test(page.url()), page.url());

await page.goto(`${BASE}/setup`);
check('/setup steps aside when nothing is wrong', !/\/setup$/.test(page.url()), page.url());

await browser.close();

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

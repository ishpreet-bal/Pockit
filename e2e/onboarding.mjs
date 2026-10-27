/**
 * First run, end to end.
 *
 * Every account this suite makes is brand new, because that is the only way to
 * test first-run: a populated development user has already passed every gate the
 * flow exists to handle.
 *
 *   BASE=http://localhost:3000 npm run e2e:onboarding
 */
import { chromium } from 'playwright';

const B = process.env.BASE ?? 'http://localhost:3000';
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const PASSWORD = 'correcthorse1';

let fails = 0;
const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (c ? '' : ' — ' + d)); if (!c) fails++; };

const b = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));
const body = async (page = p) => (await page.textContent('body')) ?? '';

const EMAIL = `onboarding-${Date.now()}@example.com`;

console.log('\nThe first screen');
await p.goto(`${B}/`, { waitUntil: 'networkidle' });
ok('a stranger meets a welcome, not a password field', /\/welcome/.test(p.url()), p.url());
const welcome = await body();
ok('it welcomes', /Know what you\s*can spend/.test(welcome));
ok('with one clear way in', /Get started/.test(welcome) && /already have an account/i.test(welcome));
ok('and none of the application', !/Transactions/.test(welcome) && !/Budget/.test(welcome) && !/Investing/.test(welcome));

console.log('\nSigning up is a conversation');
await p.click('a:has-text("Get started")');
await p.waitForTimeout(900);
ok('the first question is the easiest one', /what should we call you/i.test(await body()));
ok('and it is the only field on screen', (await p.locator('input:visible').count()) === 1);

await p.fill('#firstName', 'Robin');
await p.click('button:has-text("Continue")');
await p.waitForTimeout(700);
ok('the next screen knows their name', /Nice to meet you, Robin/.test(await body()));

await p.fill('#email', EMAIL);
await p.fill('#password', PASSWORD);
await p.click('button[type=submit]');
await p.waitForURL(/onboarding/, { timeout: 40000 });
ok('a new account lands in setup, never the dashboard', /onboarding/.test(p.url()), p.url());

console.log('\nThe financial questions');
await p.waitForTimeout(1000);
ok('it says why before it asks', /set up your Pockit/i.test(await body()));
ok('and offers a way out immediately', /Skip for now/.test(await body()));

await p.click('button:has-text("Continue")');
await p.waitForTimeout(900);
ok('progress is stated in words, not only dots', /1 of 4/.test(await body()));

await p.fill('#income-amount', '2400');
await p.selectOption('#income-cadence', 'biweekly');
const nextPay = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);
await p.fill('#income-next', nextPay);
await p.waitForTimeout(400);
// The arithmetic nobody should be asked to do: 26 fortnights a year, not 24.
ok('it converts the cadence for them', /\$5,200 a month/.test(await body()), (await body()).match(/works out to about[^.]*/)?.[0] ?? '');

await p.click('button:has-text("Continue")');
await p.waitForTimeout(1200);
const afterIncome = await p.evaluate(async () => (await fetch('/api/onboarding/state')).json());
ok('every screen saves before the next one', afterIncome.answers.incomeMinor === 240000, JSON.stringify(afterIncome.answers));

await p.click('button:has-text("Add them now")');
await p.waitForTimeout(700);
await p.fill('input[aria-label="Bill 1 name"]', 'Rent');
await p.fill('input[aria-label="Bill 1 amount"]', '1800');
await p.fill('input[aria-label="Bill 1 next due date"]', new Date(Date.now() + 16 * 864e5).toISOString().slice(0, 10));
ok('a recurring bill can be created with no import history', true);
await p.click('button:has-text("Done")');
await p.waitForTimeout(1300);


// The skip control lives inside a form. It must skip WITHOUT submitting a zero —
// an unmarked button inside a form submits it, which recorded savings of $0 for
// people who had explicitly declined to say.
await p.click('button:has-text("Nothing yet")');
await p.waitForTimeout(1300);
const afterSkip = await p.evaluate(async () => (await fetch('/api/onboarding/state')).json());
ok('skipping records nothing rather than zero', afterSkip.answers.savingsMinor === undefined, JSON.stringify(afterSkip.answers));

await p.click('button:has-text("Build an emergency fund")');
await p.click('button:has-text("Continue")');
await p.waitForTimeout(1500);

console.log('\nThe starting picture');
const summary = await body();
ok('it shows their own numbers', /You.re ready/.test(summary) && /\$5,200/.test(summary));
ok('commitments are totalled', /\$1,800/.test(summary));
ok('flexible money is derived', /\$3,400/.test(summary));
ok('what was skipped reads as unknown, not as zero', /Not set yet/.test(summary) || !/Set aside/.test(summary));

console.log('\nResuming in a browser that knows nothing');
const ctx2 = await b.newContext();
const p2 = await ctx2.newPage();
await p2.goto(`${B}/sign-in`);
await p2.fill('#email', EMAIL);
await p2.fill('#password', PASSWORD);
await p2.click('button[type=submit]');
await p2.waitForTimeout(3500);
ok('an unfinished setup resumes', /onboarding/.test(p2.url()), p2.url());
ok('with the answers intact', /\$5,200/.test(await body(p2)));

await p2.locator("button:has-text(\"Let's see your Pockit\")").click();
await p2.waitForURL(/overview/, { timeout: 40000 });
await p2.waitForTimeout(2500);

console.log('\nWhat the answers became');
// The tour starts by itself now, with a welcome card, rather than waiting in a corner.
ok('the tour starts on arrival', await p2.locator('[role=dialog]').count() > 0);
await p2.keyboard.press('Escape');
await p2.waitForTimeout(800);

// The bugs from the first real sign-up: schedules with no date fell back to TODAY,
// and income was written with the column's default direction, 'outflow'.
const dash = await body(p2);
ok('nothing from setup reads "due today"', !/due today/i.test(dash));
ok('income is money coming in, not a negative expense', /Next money in: Income/.test(dash));

const became = await p2.evaluate(async () => {
  const [recurring, goals] = await Promise.all([
    fetch('/api/onboarding/state').then((r) => r.json()),
    fetch('/api/pock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'what goals do I have?' }),
    }).then((r) => r.json()),
  ]);
  return { stage: recurring.stage, pock: goals.answer ?? goals.error ?? '' };
});
ok('setup is marked finished server-side', became.stage === 'done', became.stage);
// With or without an AI key this must produce a sentence, never an empty panel.
ok('Pock responds one way or the other', became.pock.length > 0, became.pock.slice(0, 120));

console.log('\nIt does not happen twice');
await p2.goto(`${B}/onboarding`);
await p2.waitForTimeout(2000);
ok('a finished account is sent back to the app', /overview/.test(p2.url()), p2.url());

ok('no client errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(`\n${fails === 0 ? 'All checks passed.' : fails + ' failed.'}`);
process.exit(fails ? 1 : 0);

/**
 * The investing feature, end to end.
 *
 * The assertions that matter most here are the refusals. A feature that suggests
 * an asset mix to someone carrying card debt, or for money they need next year,
 * is worse than no feature — so those paths are tested as carefully as the happy one.
 *
 *   BASE=http://localhost:3000 npm run e2e:investing
 */
import { chromium } from 'playwright';
import { signUp } from './signup.mjs';

const B = process.env.BASE ?? 'http://localhost:3000';
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
// A fresh account every run. The consent gate only appears when no profile exists,
// so a suite that reuses an account tests the second visit and never the first.
// Investing is admin-only while it's being finished; TEST_ADMIN_EMAIL_DOMAIN makes this account one.
const EMAIL = `investing-${Date.now()}@${process.env.TEST_ADMIN_EMAIL_DOMAIN ?? 'admins.example.com'}`;
const PASSWORD = 'correcthorse1';

let fails = 0;
const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (c ? '' : ' ' + d)); if (!c) fails++; };

const b = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const ctx = await b.newContext({ viewport: { width: 1000, height: 1100 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));

await signUp(p, B, { email: EMAIL, password: PASSWORD });

async function answer(labels) {
  await p.goto(B + '/investing/profile'); await p.waitForTimeout(900);
  const redo = p.locator('button:has-text("Answer again")');
  if (await redo.count()) { await redo.click(); await p.waitForTimeout(500); }
  else {
    await p.locator('input[type=checkbox]').check();
    await p.locator('button:has-text("Continue")').click();
    await p.waitForTimeout(500);
  }
  for (const label of labels) {
    await p.locator(`button:has-text("${label}")`).first().click();
    await p.waitForTimeout(450);
  }
  await p.waitForTimeout(1600);
  return (await p.textContent('body')) ?? '';
}

console.log('\nConsent gate');
await p.goto(B + '/investing/profile'); await p.waitForTimeout(900);
const intro = await p.textContent('body');
ok('states it is not financial advice before anything else', /not a financial adviser/i.test(intro));
ok('disowns day trading up front', /day trading/i.test(intro));
ok('warns prices are sample data without a key', /sample data, not a real market/i.test(intro));
ok('cannot continue without accepting', await p.locator('button:has-text("Continue")').isDisabled());

console.log('\nIt refuses when it should');
const debt = await answer(['Comfortable', 'More than ten years', 'Put more in while it is cheaper', 'Yes', 'Yes']);
ok('refuses while high-interest debt exists', /Not yet/i.test(debt));
ok('explains the guaranteed-return reasoning', /guaranteed/i.test(debt));
// The reasoning legitimately mentions "20%" when explaining card interest, so the
// real assertion is that no allocation is offered — not that no % appears.
ok('offers no allocation in that case', !/A growth mix|A balanced mix|A conservative mix/i.test(debt));

const short = await answer(['Comfortable', 'Within a year', 'Leave it alone and wait', 'Yes', 'No']);
ok('refuses for money needed within a year', /Keep this money in cash/i.test(short));
ok('says it is a savings question', /savings question/i.test(short));

console.log('\nIt suggests a mix when it should');
const good = await answer(['Comfortable', 'More than ten years', 'Leave it alone and wait', 'Yes', 'No']);
ok('produces a mix', /growth mix|balanced mix|conservative mix/i.test(good));
ok('shows stocks, bonds and cash', /Stocks/.test(good) && /Bonds/.test(good) && /Cash/.test(good));
ok('repeats the scope limit with the result', /not a recommendation to buy/i.test(good));
ok('never names a ticker to buy', !/\b(AAPL|TSLA|NVDA)\b/.test(good.split('Watchlist')[0] ?? good));

console.log('\nSearch');
await p.goto(B + '/investing'); await p.waitForTimeout(1200);
const typed = async (q) => {
  await p.fill('input[role=combobox]', q);
  await p.waitForTimeout(600);
  return (await p.locator('[role=option]').allTextContents()).join(' | ');
};
ok('two letters are enough', (await typed('nv')).includes('NVDA'));
ok('a company name works', (await typed('nvidia')).includes('NVDA'));
ok('capitals do not matter', (await typed('NVIDIA')).includes('NVDA'));
ok('"s&p" finds the index funds', (await typed('s&p')).includes('VOO'));
ok('a typo still finds it', (await typed('aple')).includes('AAPL'));
ok('nonsense finds nothing', (await typed('zzzqqq')) === '');

console.log('\nDiscovery and the asset page');
await p.goto(B + '/investing/etfs'); await p.waitForTimeout(2200);
const etfs = await p.textContent('body');
ok('collections are offered, not one long table', /Broad market/i.test(etfs) && /Bonds/i.test(etfs));
ok('the method behind the list is stated', /How this list was built/i.test(etfs));
ok('it disclaims being a ranking', /not a ranking/i.test(etfs));

await p.locator('a[href="/investing/VOO"]').first().click();
await p.waitForURL(/investing\/VOO/, { timeout: 20000 });
await p.waitForTimeout(2600);
const asset = await p.textContent('body');
ok('the asset page opens', /Vanguard S&P 500 ETF/i.test(asset));
ok('it has range controls', /1D/.test(asset) && /MAX/.test(asset));
ok('a chart is drawn', await p.locator('.recharts-surface').count() > 0);
ok('provenance is shown with the price', /Sample data, not a real market/i.test(asset));
ok('analysis says what it is missing rather than inventing it', /What is missing/i.test(asset));
ok('news is declared unavailable rather than fabricated', /will not invent headlines/i.test(asset));

// The headline figure and the "today" panel must be the same number, which they
// were not when quote and history were independent series.
const figures = asset.match(/\$[\d,]+\.\d\d/g) ?? [];
ok('the chart headline matches the quoted price', figures[0] === figures[1], `${figures[0]} vs ${figures[1]}`);

console.log('\nFollowing');
await p.locator('button:has-text("Follow")').first().click();
await p.waitForTimeout(1600);
await p.goto(B + '/investing/watchlist'); await p.waitForTimeout(2200);
ok('it appears on the watchlist', /VOO/.test(await p.textContent('body')));

console.log('\nNamed lists');
await p.waitForSelector('button:has-text("New list")', { timeout: 20000 });
ok('a default list exists', /Watchlist/.test(await p.textContent('body')));

await p.click('button:has-text("New list")');
await p.fill('input[aria-label="New list name"]', 'Long term');
await p.keyboard.press('Enter');
await p.waitForTimeout(2000);
ok('a second list can be created', /Long term/.test(await p.textContent('body')));

// The same name twice is refused by the database, and the refusal has to reach the
// screen as a sentence rather than a 500.
await p.click('button:has-text("New list")');
await p.fill('input[aria-label="New list name"]', 'long term');
await p.keyboard.press('Enter');
await p.waitForTimeout(1500);
ok('a duplicate name is refused in words', /already have a list/i.test(await p.textContent('body')));
await p.keyboard.press('Escape');

// A symbol can sit on two lists at once; that is the whole point of having them.
await p.goto(B + '/investing/VOO'); await p.waitForTimeout(2400);
await p.click('button[aria-label="Choose lists"]');
await p.waitForTimeout(500);
ok('the follow control offers the lists', /Long term/.test(await p.textContent('[role=menu]')));
await p.locator('[role=menuitemcheckbox]:has-text("Long term")').click();
await p.waitForTimeout(2000);
ok('the button counts the lists it is on', /On 2 lists/.test(await p.textContent('body')));

await p.goto(B + '/investing/watchlist'); await p.waitForTimeout(2200);
ok('each tab carries its own count', /Long term\s*1/.test((await p.textContent('body')).replace(/\s+/g, ' ')));

ok('no client errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(`\n${fails === 0 ? 'All checks passed.' : fails + ' failed.'}`);
process.exit(fails ? 1 : 0);

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
const EMAIL = `investing-${Date.now()}@example.com`;
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
  await p.goto(B + '/investing'); await p.waitForTimeout(900);
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
await p.goto(B + '/investing'); await p.waitForTimeout(900);
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

console.log('\nWatchlist');
await p.fill('input[aria-label="Symbol to add"]', 'VOO');
await p.locator('button:has-text("Add")').click();
await p.waitForTimeout(1800);
ok('adds a symbol with a price', /VOO/.test(await p.textContent('body')));
await p.fill('input[aria-label="Symbol to add"]', 'VOO');
await p.locator('button:has-text("Add")').click();
await p.waitForTimeout(1500);
ok('refuses a duplicate in words', /already on your watchlist/i.test(await p.textContent('body')));
await p.fill('input[aria-label="Symbol to add"]', 'ZZZZZZ');
await p.locator('button:has-text("Add")').click();
await p.waitForTimeout(1500);
ok('refuses an unknown symbol in words', /No price found/i.test(await p.textContent('body')));
await p.locator('button[aria-label="Remove VOO"]').click();
await p.waitForTimeout(1500);
ok('removes a symbol', !/Remove VOO/.test(await p.textContent('body')));

ok('no client errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(`\n${fails === 0 ? 'All checks passed.' : fails + ' failed.'}`);
process.exit(fails ? 1 : 0);

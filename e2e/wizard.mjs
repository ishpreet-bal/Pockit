/**
 * The budget wizard's branching, end to end.
 *
 * Exists because the complaint that prompted it was precisely that the wizard LOOKED
 * personalised and was not: picking a goal changed the heading and nothing else. The
 * only honest test of that is to walk several goals and assert they ask different
 * things, so a future refactor cannot quietly collapse them back together.
 *
 *   BASE=http://localhost:3000 npm run e2e:wizard
 */
import { chromium } from 'playwright';

const B = process.env.BASE ?? 'http://localhost:3000';
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const EMAIL = process.env.E2E_EMAIL ?? 'ish@example.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'correcthorse1';
let fails=0; const ok=(n,c,d='')=>{console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':' '+d)); if(!c)fails++;};
const b = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const ctx=await b.newContext({viewport:{width:1100,height:1000}});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await p.goto(B+'/sign-in'); await p.fill('#email', EMAIL); await p.fill('#password', PASSWORD);
await p.click('button[type=submit]'); await p.waitForURL(/overview/,{timeout:30000});

async function runIntent(labelText) {
  await p.goto(B+'/budget/setup'); await p.waitForTimeout(700);
  await p.locator(`button:has-text("${labelText}")`).first().click();
  await p.waitForTimeout(600);
  const inputs = p.locator('input[inputmode=decimal]');
  await inputs.nth(0).fill('9000'); await inputs.nth(1).fill('2500');
  await p.waitForTimeout(300);
  await p.locator('button:has-text("Next"), button:has-text("See my plan")').first().click();
  await p.waitForTimeout(800);
  return (await p.textContent('body')) ?? '';
}

console.log('\nEach goal asks its own questions');
const debt = await runIntent('Pay down debt');
ok('debt branch asks about minimums', /minimum payments add up/i.test(debt));
ok('debt branch asks avalanche vs snowball', /Highest interest first|Smallest balance first/i.test(debt));

const purchase = await runIntent('Save for something specific');
ok('purchase branch asks what for', /What are you saving for/i.test(purchase));
ok('purchase branch does not ask debt questions', !/minimum payments add up/i.test(purchase));

const ef = await runIntent('Build an emergency fund');
ok('emergency branch asks months of expenses', /months of expenses do you want covered/i.test(ef));

const invest = await runIntent('Invest more');
ok('investing branch asks about horizon', /need this money back/i.test(invest));
ok('investing branch asks about a buffer', /emergency fund already/i.test(invest));

console.log('\nAnswers change the plan, visibly');
// Investing with no buffer must redirect to cash AND say so.
await p.locator('button:has-text("No")').last().click();
await p.waitForTimeout(500);
ok('no-buffer warning appears', /selling at the worst possible moment/i.test(await p.textContent('body')));

console.log('\n"I am not sure" path');
await p.goto(B+'/budget/setup'); await p.waitForTimeout(700);
await p.locator('button:has-text("help me decide")').click();
await p.waitForTimeout(500);
ok('triage asks about debt first', /owe money on cards or loans/i.test(await p.textContent('body')));
await p.locator('button:has-text("Yes, and it worries me")').click();
await p.waitForTimeout(400);
await p.locator('button:has-text("Under a month")').click();
await p.waitForTimeout(400);
await p.locator('button:has-text("I have no idea where it goes")').click();
await p.waitForTimeout(600);
const rec = await p.textContent('body');
ok('recommends paying down debt', /Start with: Pay down debt/i.test(rec));
ok('shows its reasoning', /costs more than savings/i.test(rec));
await p.locator('button:has-text("Use this")').click();
await p.waitForTimeout(700);
ok('picking the recommendation advances the wizard', /Check these two numbers/i.test(await p.textContent('body')));

ok('no client errors', errs.length===0, errs.slice(0,2).join(' | '));
await b.close();
console.log(`\n${fails===0?'All checks passed.':fails+' failed.'}`);
process.exit(fails?1:0);

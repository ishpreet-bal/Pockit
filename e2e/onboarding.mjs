/**
 * The personalised sign-up walkthrough.
 *
 * Asserts the thing that is easy to fake and easy to regress: that the first
 * answer genuinely changes the wording, the seeded goal and the recommended next
 * step, rather than only the heading.
 *
 * Needs a database with NO existing account for these addresses, since it signs up.
 *
 *   BASE=http://localhost:3000 npm run e2e:onboarding
 */
import { chromium } from 'playwright';
import { signUp } from './signup.mjs';

const B = process.env.BASE ?? 'http://localhost:3000';
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
let fails=0; const ok=(n,c,d='')=>{console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':' '+d)); if(!c)fails++;};
const b = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const ctx=await b.newContext({viewport:{width:900,height:1000}});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,140)));

await signUp(p, B, { email: 'ob@example.com', displayName: 'Ishpreet Bal' });
await p.waitForTimeout(900);

const s0 = await p.textContent('body');
ok('Pock greets you by name', /Hi Ishpreet/.test(s0));
ok('first step asks what you are here for', /What brings you here/i.test(s0));
ok('cannot continue without answering', await p.locator('button:has-text("Continue")').isDisabled());

await p.locator('button:has-text("Pay down debt")').click();
await p.waitForTimeout(300);
ok('continue unlocks after choosing', !(await p.locator('button:has-text("Continue")').isDisabled()));
await p.locator('button:has-text("Continue")').click(); await p.waitForTimeout(600);
await p.locator('button:has-text("Continue")').click(); await p.waitForTimeout(600);
await p.locator('button:has-text("Continue")').click(); await p.waitForTimeout(700);

const goalStep = await p.textContent('body');
ok('goal step is reworded for debt', /What are you trying to clear/i.test(goalStep));
ok('goal name is seeded for debt', (await p.locator('#goalName').inputValue()) === 'Clear my debt');

await p.locator('button:has-text("Continue")').click(); await p.waitForTimeout(700);
const done = await p.textContent('body');
ok('final step uses your name', /You're set up, Ishpreet/.test(done));
ok('recommends one debt-specific next step', /Add what you owe/i.test(done));
ok('explains why that step', /payoff strategies/i.test(done));

await p.locator('button:has-text("Add my debts")').click();
await p.waitForURL(/debts/,{timeout:30000});
ok('the recommendation actually takes you there', /\/debts/.test(p.url()));

// A different answer must reach a different recommendation, or the branching is
// cosmetic — which is exactly what it was before.
const ctx2 = await b.newContext({ viewport: { width: 900, height: 1000 } });
const p2 = await ctx2.newPage();
p2.on('pageerror', e => errs.push(e.message.slice(0,140)));
await signUp(p2, B, { email: 'ob2@example.com', displayName: 'Sam Other' });
await p2.waitForTimeout(800);
await p2.locator('button:has-text("Understand and control my spending")').click();
await p2.waitForTimeout(300);
await p2.locator('button:has-text("Skip the rest")').click();
await p2.waitForTimeout(700);
const other = await p2.textContent('body');
ok('a different goal gives a different next step', /Bring in a bank statement/i.test(other));
ok('and greets the other person by their name', /You're set up, Sam/.test(other));

ok('no client errors', errs.length===0, errs.slice(0,2).join(' | '));
await b.close();
console.log(`\n${fails===0?'All checks passed.':fails+' failed.'}`);
process.exit(fails?1:0);

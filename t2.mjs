import { chromium } from 'playwright';
const BASE='http://localhost:3310', DIR=process.argv[2];
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await b.newContext({ viewport:{width:1280,height:1000} })).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message.slice(0,140)));

await page.goto(`${BASE}/sign-up`,{waitUntil:'domcontentloaded'});
await page.fill('#email',`t${Date.now()}@x.com`); await page.fill('#password','supersecret123');
await page.click('button[type=submit]'); await page.waitForURL(/onboarding/,{timeout:25000});

// A brand-new user with NOTHING: does the dashboard guide rather than show empty charts?
await page.goto(`${BASE}/overview`,{waitUntil:'domcontentloaded'});
const fresh = await page.textContent('body');
console.log('new user sees guidance:', /Let.s get you a picture|Add the bills you already know/i.test(fresh??''));
console.log('no empty-chart clutter:', !/NaN|Infinity/.test(fresh??''));
await page.screenshot({path:`${DIR}/new-user.png`, fullPage:true});

// Onboard with an account only, then add a recurring bill with ZERO history.
await page.evaluate(()=>fetch('/api/onboarding',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({accounts:[{name:'Chequing',type:'chequing',balance:'4000.00'}],goal:null,loadDemo:false})}));

const sched = await page.evaluate(async () => {
  const today = new Date().toISOString().slice(0,10);
  const res = await fetch('/api/schedules',{method:'POST',headers:{'content-type':'application/json'},
    body: JSON.stringify({ name:'Rent', amount:'1800.00', cadence:'monthly', interval:1, dayOfMonth:1, startDate: today, direction:'outflow' })});
  return { status: res.status, body: await res.json() };
});
console.log('recurring created with no history:', sched.status===200, sched.body.nextExpectedDate);

await page.goto(`${BASE}/recurring`,{waitUntil:'domcontentloaded'});
const rec = await page.textContent('body');
console.log('recurring page shows it (no "import more history" dead end):', /Rent/.test(rec??'') && !/import more history/i.test(rec??''));

await page.goto(`${BASE}/overview`,{waitUntil:'domcontentloaded'});
const ov = await page.textContent('body');
console.log('dashboard reflects the bill:', /Rent/.test(ov??''));
console.log('figure is explained, not bare:', /minus|still to pay|bills already due|in cash/i.test(ov??''));
await page.screenshot({path:`${DIR}/dash.png`, fullPage:true});

for (const p of ['/transactions','/budget','/goals','/calendar','/recurring','/forecast','/analytics','/settings']) {
  const r = await page.goto(`${BASE}${p}`,{waitUntil:'domcontentloaded',timeout:30000});
  const body = await page.textContent('body');
  const bad = /Application error|omitted in production/i.test(body??'');
  if (r?.status()!==200 || bad) console.log(`  ${p}: ${r?.status()} ${bad?'ERROR':''}`);
}
console.log('all pages ok');
console.log('errors:', errs.length? [...new Set(errs)].slice(0,3).join(' | '):'none');
await b.close();

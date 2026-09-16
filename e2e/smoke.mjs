/**
 * End-to-end smoke test against a real database.
 *
 * This exists because unit tests never caught the bugs that actually broke the app:
 * a crash in currency formatting that only triggered on figures over $1,000, a
 * migration script that could not run at all, and paired transfers being counted
 * twice. All three needed a real browser talking to a real Postgres.
 *
 *   npm run e2e          (expects a server on $BASE and a migrated database)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;

const failures = [];
let checks = 0;

function check(name, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name} ${detail}`);
    failures.push(`${name} ${detail}`.trim());
  }
}

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

const serverErrors = [];
page.on('pageerror', (e) => serverErrors.push(`${page.url()}: ${e.message.slice(0, 160)}`));

try {
  console.log('\nAuth and onboarding');
  const email = `smoke${Date.now()}@example.com`;
  await page.goto(`${BASE}/sign-up`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', email);
  await page.fill('#password', 'smoke-test-password');
  await page.click('button[type=submit]');
  await page.waitForURL(/onboarding|overview/, { timeout: 30000 });
  check('registration redirects into the app', /onboarding|overview/.test(page.url()));

  const onboarded = await page.evaluate(async () => {
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        incomeSchedule: 'biweekly',
        accounts: [{ name: 'Chequing', type: 'chequing', balance: '4125.00' }],
        goal: { name: 'Emergency fund', target: '15000', targetDate: null },
        loadDemo: true,
      }),
    });
    return res.status;
  });
  check('onboarding with demo data succeeds', onboarded === 200, `status ${onboarded}`);

  console.log('\nEvery page renders with real data');
  const pages = [
    '/overview', '/transactions', '/accounts', '/budget', '/goals', '/recurring',
    '/forecast', '/debts', '/analytics', '/calendar', '/business', '/imports',
    '/imports/new', '/assistant', '/settings',
  ];
  for (const path of pages) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    const body = (await page.textContent('body')) ?? '';
    const errored = /Application error|omitted in production build/i.test(body);
    check(path, res?.status() === 200 && !errored, errored ? '(error boundary)' : `status ${res?.status()}`);
  }

  console.log('\nOverview shows real figures, not an empty state');
  await page.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded' });
  const overview = (await page.textContent('body')) ?? '';
  check('dashboard has content', /Available|Left this month|Coming up/i.test(overview) && !/Let.s get you a picture/i.test(overview));
  // Every headline figure must carry its own explanation, never a bare number.
  check('the headline figure is explained', /in cash|still to pay|minus|less/i.test(overview));
  // Regression: a transfer is detected on both legs, and is neither income nor
  // spending — it must not appear as an upcoming bill or as recent activity.
  check('transfers are not shown as money in or out', !/Transfer from chequing/i.test(overview));

  console.log('\nImport round trip');
  await page.goto(`${BASE}/imports/new`, { waitUntil: 'domcontentloaded' });
  const csv = [
    'Date,Description,Amount',
    '2026-09-11,SHELL #4021 TORONTO ON,-61.40',
    '2026-09-11,TIM HORTONS #772,-4.85',
    '2026-09-12,PAYROLL DEPOSIT ACME,1250.00',
    '2026-09-11,SHELL #4021 TORONTO ON,-61.40',
  ].join('\n');

  const upload = await page.evaluate(async (content) => {
    const fd = new FormData();
    fd.set('file', new File([content], 'statement.csv', { type: 'text/csv' }));
    fd.set('accountId', document.querySelector('#accountId')?.value ?? '');
    fd.set('dateFormatHint', 'ymd');
    const res = await fetch('/api/imports/upload', { method: 'POST', body: fd });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, csv);

  check('upload succeeds', upload.status === 200, JSON.stringify(upload.body).slice(0, 120));
  check('four rows extracted', upload.body?.candidateCount === 4, `got ${upload.body?.candidateCount}`);
  check('the repeated row is flagged as a duplicate', upload.body?.duplicateCount === 1, `got ${upload.body?.duplicateCount}`);

  if (upload.body?.importId) {
    const id = upload.body.importId;
    const result = await page.evaluate(async (importId) => {
      await fetch(`/api/imports/${importId}/candidates`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'accept_all_confident', confidenceFloor: 50 }),
      });
      const commit = await (await fetch(`/api/imports/${importId}/commit`, { method: 'POST' })).json();
      const rollback = await (await fetch(`/api/imports/${importId}/rollback`, { method: 'POST' })).json();
      return { commit, rollback };
    }, id);

    check('commits the non-duplicate rows only', result.commit?.imported === 3, `imported ${result.commit?.imported}`);
    check('commit reports no failures', (result.commit?.failed?.length ?? 1) === 0, JSON.stringify(result.commit?.failed));
    check('rollback removes exactly what it added', result.rollback?.removed === 3, `removed ${result.rollback?.removed}`);
  }

  console.log('\nExport');
  const exported = await page.evaluate(async () => {
    const res = await fetch('/api/export?dataset=transactions');
    return { status: res.status, text: (await res.text()).slice(0, 4000) };
  });
  check('transactions export', exported.status === 200 && exported.text.includes('Date,Description'));
  check('export keeps the original currency column', exported.text.includes('Base currency'));

  console.log('\nRejected input');
  const noAccount = await page.evaluate(async () => {
    const fd = new FormData();
    fd.set('file', new File(['Date,Description,Amount\n2026-09-01,X,-1.00'], 'a.csv', { type: 'text/csv' }));
    fd.set('accountId', '');
    const res = await fetch('/api/imports/upload', { method: 'POST', body: fd });
    return res.status;
  });
  check('upload without an account is rejected up front', noAccount === 400, `status ${noAccount}`);

  check('no unhandled client errors', serverErrors.length === 0, serverErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  console.log('\nFAILED:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

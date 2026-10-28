/** Focused regressions for preview CORS, balances, PDF failures and search races. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { signUp } from './signup.mjs';

const base = process.env.BASE ?? 'http://localhost:3000';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let checks = 0;
function check(label, condition) { assert.ok(condition, label); checks++; console.log(`  ✓ ${label}`); }
const result = { symbol: 'NVDA', name: 'NVIDIA', kind: 'stock', exchange: 'NASDAQ', score: 1, matched: [] };

// A valid one-page PDF without a text layer, independent of PDF-generation packages.
function scannedPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signUp(page, base);
  const api = context.request;

  console.log('\nPreview and account APIs');
  const preflight = await api.fetch(`${base}/api/mobile/summary`, {
    method: 'OPTIONS', headers: {
      origin: 'http://localhost:8081',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization,content-type,x-pockit-space',
    },
  });
  check('shared workspace header is allowed for the local browser preview', preflight.status() === 204 && preflight.headers()['access-control-allow-headers'].includes('x-pockit-space'));
  const outsider = await browser.newContext();
  check('balances require authentication', (await outsider.request.get(`${base}/api/mobile/balance`)).status() === 401);
  await outsider.close();

  const saved = await api.post(`${base}/api/mobile/balance`, { data: { amount: 1732.45 } });
  check('everyday balance can be updated', saved.ok());
  const balance = await (await api.get(`${base}/api/mobile/balance`)).json();
  const account = balance.accounts.find((row) => row.type === 'chequing');
  check('account list returns the saved balance and currency', account?.balanceMinor === 173245 && account?.currency === 'CAD' && account?.balanceFormatted.includes('1,732.45'));
  const summary = await (await api.get(`${base}/api/mobile/summary`)).json();
  check('mobile account balance agrees with the shared dashboard calculation', summary.home.safeToSpendMinor === account.balanceMinor);
  check('an invalid requested month does not crash the database query', (await api.get(`${base}/api/mobile/transactions?month=2026-99`)).ok());

  console.log('\nScanned PDF');
  const upload = await api.post(`${base}/api/imports/upload`, { multipart: {
    accountId: account.id,
    file: { name: 'scanned.pdf', mimeType: 'application/pdf', buffer: scannedPdf() },
  } });
  const failure = await upload.json();
  check('scanned PDFs return a clear, actionable response instead of a server error', upload.status() === 422 && /JPG or PNG images/.test(failure.error));

  console.log('\nInvestment search');
  await page.goto(`${base}/investing`);
  const search = page.getByRole('combobox', { name: 'Search stocks, ETFs or crypto' });
  let releaseMarket;
  const marketGate = new Promise((resolve) => { releaseMarket = resolve; });
  let marketDone;
  const marketHandled = new Promise((resolve) => { marketDone = resolve; });
  await page.route('**/api/market/search?*', async (route) => {
    const slow = new URL(route.request().url()).searchParams.get('q') === 'slow';
    if (slow) await marketGate;
    try { await route.fulfill({ json: { results: [result] } }); }
    catch { /* An aborted stale request has no response consumer. */ }
    finally { if (slow) marketDone(); }
  });
  const marketRequest = page.waitForRequest('**/api/market/search?q=slow');
  await search.fill('slow'); await marketRequest;
  await search.fill(''); releaseMarket(); await marketHandled;
  await page.waitForTimeout(200);
  check('clearing investment search discards a late response', await page.locator('[role="option"]').count() === 0);
  await search.press('ArrowDown');
  await search.fill('nv');
  await page.locator('[role="option"]').first().waitFor();
  const activeId = await search.getAttribute('aria-activedescendant');
  check('keyboard search exposes its active option to assistive technology', Boolean(activeId) && await page.locator(`[id="${activeId}"]`).count() === 1);
  await search.press('Enter');
  await page.waitForURL('**/investing/NVDA');
  check('keyboard selection still opens the chosen asset', page.url().endsWith('/investing/NVDA'));

  console.log('\nTransaction suggestions');
  await page.goto(`${base}/overview`);
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add transaction' });
  const description = sheet.locator('input[role="combobox"]');
  let releaseDescription;
  const descriptionGate = new Promise((resolve) => { releaseDescription = resolve; });
  let descriptionDone;
  const descriptionHandled = new Promise((resolve) => { descriptionDone = resolve; });
  await page.route('**/api/transactions/suggest?*', async (route) => {
    const slow = new URL(route.request().url()).searchParams.get('q') === 'slow';
    if (slow) await descriptionGate;
    try { await route.fulfill({ json: { suggestions: [{ description: 'Coffee shop', categoryId: null, uses: 3 }] } }); }
    catch { /* An aborted stale request has no response consumer. */ }
    finally { if (slow) descriptionDone(); }
  });
  const descriptionRequest = page.waitForRequest('**/api/transactions/suggest?q=slow');
  await description.fill('slow'); await descriptionRequest;
  await description.fill(''); releaseDescription(); await descriptionHandled;
  await page.waitForTimeout(200);
  check('clearing a transaction description discards late suggestions', await sheet.locator('[role="option"]').count() === 0);
  await description.fill('coffee');
  await sheet.locator('[role="option"]').first().waitFor();
  await description.press('Escape');
  check('Escape dismisses suggestions while keeping the transaction open', await sheet.isVisible() && await sheet.locator('[role="option"]').count() === 0);
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  check('a second Escape closes the transaction sheet', await sheet.count() === 0);
  check('no uncaught client errors', errors.length === 0);
} finally {
  await browser.close();
}
console.log(`\n${checks}/${checks} checks passed`);

/** Trip and investing flows against the committed mobile browser app and local database. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.BASE ?? 'http://localhost:3000';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let checks = 0;
const check = (label, value) => { assert.ok(value, label); console.log(`  ✓ ${label}`); checks++; };
const place = (name, lat) => ({ name, address: `${name}, Ontario`, lat, lon: -79.4 });
const errors = [];
const consoleErrors = [];
await mkdir('out', { recursive: true });
const reuse = process.env.E2E_REUSE === '1' || process.argv.includes('--reuse');
const users = reuse ? JSON.parse(await readFile('out/trip-investing-users.json', 'utf8')) : { email: `trip-investing-${Date.now()}@example.com`, otherEmail: `holding-isolation-${Date.now()}@example.com` };
await writeFile('out/trip-investing-users.json', JSON.stringify(users));
async function sessionFor(request, email, firstName) {
  const response = await request.post(`${base}/api/mobile/auth/${reuse ? 'sign-in' : 'sign-up'}`, { data: { firstName, email, password: 'correcthorse1' } });
  const body = await response.json();
  assert.ok(body.token, body.error ?? `Test session failed (${response.status()})`);
  return body.token;
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const token = await sessionFor(context.request, users.email, 'Tester');
  check('the test mobile account authenticates', Boolean(token));
  await context.addCookies([{ name: 'pockit_session', value: token, url: base, httpOnly: true, sameSite: 'Lax' }]);
  if (!reuse) {
    const setup = await context.request.post(`${base}/api/onboarding`, { data: { accounts: [{ name: 'Chequing', type: 'chequing', balance: '1000.00' }] } });
    assert.ok(setup.ok(), 'test account setup');
  }
  assert.ok((await context.request.post(`${base}/api/onboarding/apply`)).ok(), 'onboarding stage completed');
  await context.request.patch(`${base}/api/onboarding/state`, { data: { tourCompleted: true } });
  if (reuse) {
    const existing = await (await context.request.get(`${base}/api/investing/holdings`)).json();
    for (const holding of existing.holdings) await context.request.delete(`${base}/api/investing/holdings?id=${holding.id}`);
  }
  await page.addInitScript((session) => { sessionStorage.setItem('pockit.session', session); localStorage.setItem('pockit.investLevel', 'beginner'); }, token);

  const years = await (await context.request.get(`${base}/api/mobile/vehicles`)).json();
  check('current cars are in the catalogue', years.items.includes('2026'));
  check('malformed locations are rejected', (await context.request.get(`${base}/api/mobile/route?from=,&to=43,-79`)).status() === 400);
  check('incomplete search coordinates are rejected', (await context.request.get(`${base}/api/mobile/places?lat=43`)).status() === 400);
  const policy = (await context.request.get(`${base}/app/trip`)).headers()['permissions-policy'];
  check('the browser trip planner can request location permission', policy.includes('geolocation=(self)'));

  const cad = { name: 'Canadian fund', symbol: 'VFV', quantity: '2', currency: 'CAD', currentValue: '400.00', costBasis: '300.00' };
  const usd = { name: 'US shares', symbol: 'AAPL', quantity: '1.25', currency: 'USD', currentValue: '120.00', costBasis: '100.00' };
  const cadResponse = await context.request.post(`${base}/api/investing/holdings`, { data: cad });
  const usdResponse = await context.request.post(`${base}/api/investing/holdings`, { data: usd });
  check('manual positions can be created in two currencies', cadResponse.status() === 201 && usdResponse.status() === 201);
  const cadId = (await cadResponse.json()).id;
  const usdId = (await usdResponse.json()).id;
  const held = await (await context.request.get(`${base}/api/mobile/summary`)).json();
  check('portfolio totals preserve currency boundaries and recorded values', held.invest.totals.some((t) => t.currency === 'CAD' && t.valueMinor === 40000) && held.invest.totals.some((t) => t.currency === 'USD' && t.valueMinor === 12000));
  check('sample quotes never replace recorded holdings', held.invest.holdings.every((h) => h.valuation === 'recorded' && h.changePct === null));
  const outsider = await browser.newContext();
  check('holdings require authentication', (await outsider.request.get(`${base}/api/investing/holdings`)).status() === 401);
  const otherToken = await sessionFor(outsider.request, users.otherEmail, 'Other');
  assert.ok(otherToken, 'second test account created');
  const foreign = { headers: { authorization: `Bearer ${otherToken}` } };
  check('another workspace cannot edit a holding', (await outsider.request.patch(`${base}/api/investing/holdings`, { ...foreign, data: { ...usd, id: usdId, currentValue: '1.00' } })).status() === 404);
  check('another workspace cannot delete a holding', (await outsider.request.delete(`${base}/api/investing/holdings?id=${usdId}`, foreign)).status() === 404);
  await outsider.close();
  await page.goto(`${base}/investing/portfolio`);
  check('web portfolio exposes separate CAD and USD totals', await page.getByRole('link', { name: /^CAD ·/ }).count() === 1 && await page.getByRole('link', { name: /^USD ·/ }).count() === 1);
  await context.request.delete(`${base}/api/investing/holdings?id=${cadId}`);
  await context.request.delete(`${base}/api/investing/holdings?id=${usdId}`);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Add holding', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add holding', exact: true });
  await form.getByLabel('Name', { exact: true }).fill('My manual fund');
  await form.getByLabel('Recorded total value', { exact: true }).fill('500.00');
  await form.getByLabel('Total cost basis', { exact: true }).fill('450.00');
  await form.getByRole('button', { name: 'Save holding', exact: true }).click();
  await page.getByRole('table').getByText('My manual fund', { exact: true }).waitFor();
  check('a real user can add a holding through the web form', true);
  await page.goto(`${base}/app/holdings`);
  await page.getByText('My manual fund', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Holding value', exact: true }).fill('654.32');
  await page.getByRole('button', { name: 'Save holding', exact: true }).click();
  await page.getByText('My manual fund', { exact: true }).waitFor();
  const edited = await (await context.request.get(`${base}/api/mobile/summary`)).json();
  check('mobile edits refresh the shared portfolio without changing cash', edited.invest.totals[0]?.valueMinor === 65432 && edited.home.safeToSpendMinor === held.home.safeToSpendMinor);
  await page.getByText('My manual fund', { exact: true }).click();
  await page.getByRole('button', { name: 'Remove holding', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm removal', exact: true }).click();
  await page.getByText('No holdings recorded', { exact: true }).waitFor();
  check('a holding can be removed from mobile after confirmation', (await (await context.request.get(`${base}/api/investing/holdings`)).json()).holdings.length === 0);

  await page.goto(`${base}/app/trip`);
  await page.getByText('Choose your car', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('2025');
  await page.getByText('2025', { exact: true }).click();
  await page.getByText('Toyota', { exact: true }).click();
  await page.getByText('Corolla', { exact: true }).click();
  await page.getByText(/Wheel Drive/).first().click();
  await page.getByText('2025 Toyota Corolla', { exact: true }).waitFor();
  check('a recent car can be selected through all four picker steps', true);

  await page.getByText('Change', { exact: true }).click();
  // Not in the list: estimated from what the person knows about the car.
  await page.getByText('Can’t find your car? Enter it yourself', { exact: true }).click();
  await page.getByPlaceholder('2016', { exact: true }).fill('2016');
  await page.getByPlaceholder('2.0', { exact: true }).fill('2.0');
  await page.getByPlaceholder('e.g. 2016 Mazda 3').fill('My estimated SUV');
  await page.getByText('SUV or crossover', { exact: true }).click();
  await page.getByText('All four (AWD or 4x4)', { exact: true }).click();
  await page.getByText('Estimate my fuel use', { exact: true }).click();
  await page.getByText(/similar SUVs with about a 2\.0L engine/).waitFor();
  await page.getByRole('button', { name: 'Use this car', exact: true }).click();
  await page.getByText('My estimated SUV', { exact: true }).waitFor();
  check('a car not in the list is estimated from its year, engine and type', true);

  await page.getByText('Change', { exact: true }).click();
  await page.getByText('Can’t find your car? Enter it yourself', { exact: true }).click();
  await page.getByText('I know my fuel use', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Car name', exact: true }).fill('My Canadian car');
  await page.getByRole('textbox', { name: 'Consumption per 100 km' }).fill('7.5');
  await page.getByRole('button', { name: 'Use this car', exact: true }).click();
  await page.getByText('My Canadian car', { exact: true }).waitFor();
  await page.reload();
  await page.getByText('My Canadian car', { exact: true }).waitFor();
  check('manual vehicle choice survives a browser reload', true);

  // Fixed places/routes keep the UI suite independent of free public services.
  await page.route('**/api/mobile/places?*', async (request) => {
    const query = new URL(request.request().url()).searchParams.get('q') ?? '';
    if (query === 'slow') await new Promise((resolve) => setTimeout(resolve, 650));
    await request.fulfill({ json: { places: [place(query === 'origin' ? 'Origin' : query === 'slow' ? 'Old destination' : 'Destination', query === 'origin' ? 43 : 44)] } });
  });
  await page.route('**/api/mobile/route?*', (request) => request.fulfill({ json: { route: { distanceKm: 100, durationMin: 60, points: [[43, -79.4], [44, -79.4]], source: 'osm' } } }));
  await page.getByText('Search for a place', { exact: true }).first().click();
  await page.getByRole('textbox', { name: 'From place' }).fill('origin');
  await page.getByText('Origin', { exact: true }).click();
  await page.getByText('Search for a place', { exact: true }).click();
  const destination = page.getByRole('textbox', { name: 'To place' });
  const sent = page.waitForRequest((r) => r.url().includes('/api/mobile/places?') && new URL(r.url()).searchParams.get('q') === 'slow');
  await destination.fill('slow');
  await sent;
  await destination.fill('');
  await page.waitForTimeout(850);
  check('clearing a place search discards the old response', await page.getByText('Old destination', { exact: true }).count() === 0);
  await destination.fill('destination');
  await page.getByText('Destination', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Gas price', exact: true }).fill('2');
  await page.getByText('CAD 15.00', { exact: true }).first().waitFor();
  check('manual consumption produces the expected trip cost', true);
  await page.getByRole('switch', { name: 'Round trip' }).click();
  await page.getByText('CAD 30.00', { exact: true }).first().waitFor();
  check('round trip doubles the fuel estimate', true);
  await page.getByRole('button', { name: /Add CAD 30.00 to my spending/ }).click();
  await page.getByText('Added the fuel estimate to your spending.').waitFor();
  const transactions = await (await context.request.get(`${base}/api/mobile/transactions`)).json();
  check('the estimated trip can be saved to the real ledger', transactions.transactions.some((t) => t.name.includes('Origin') && t.amountMinor === -3000));
  check('trip screen fits at 390px', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await mkdir('out', { recursive: true });
  await page.screenshot({ path: 'out/trip-improvements.png', fullPage: true });

  await context.request.post(`${base}/api/investing/watchlist`, { data: { symbol: 'AAPL' } });
  await page.goto(`${base}/app/invest`);
  await page.getByText('Watching', { exact: true }).waitFor();
  check('beginners can see their watchlist without owning investments', await page.getByText('AAPL', { exact: true }).count() > 0);
  await page.goto(`${base}/app/stock/AAPL`);
  await page.getByRole('button', { name: '★ Watching', exact: true }).waitFor();
  await page.getByText('Illustrative chart — sample data.', { exact: true }).waitFor();
  check('stock charts load and identify their sample source', true);
  await page.route('**/api/investing/watchlist?*', (request) => request.fulfill({ status: 503, json: { error: 'Watchlist is temporarily unavailable.' } }));
  await page.getByRole('button', { name: '★ Watching', exact: true }).click();
  await page.getByText('Watchlist is temporarily unavailable.', { exact: true }).waitFor();
  check('watchlist failures are visible and preserve the current state', await page.getByRole('button', { name: '★ Watching', exact: true }).count() === 1);
  check('stock screen fits at 390px', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await page.screenshot({ path: 'out/investing-improvements.png', fullPage: true });
  const current = await (await context.request.get(`${base}/api/mobile/summary`)).json();
  await page.route('**/api/mobile/summary', (request) => request.fulfill({ json: { ...current, currency: 'JPY' } }));
  await page.goto(`${base}/app/trip`);
  await page.waitForFunction(() => document.querySelector('[aria-label="Gas price"]')?.value === '');
  check('switching currency does not reuse the previous currency’s fuel price', true);
  await page.getByText('Search for a place', { exact: true }).first().click();
  await page.getByRole('textbox', { name: 'From place' }).fill('origin');
  await page.getByText('Origin', { exact: true }).click();
  await page.getByText('Search for a place', { exact: true }).click();
  await page.getByRole('textbox', { name: 'To place' }).fill('destination');
  await page.getByText('Destination', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Gas price', exact: true }).fill('200');
  await page.getByText(/^JPY\s*1,500$/).waitFor();
  check('trip estimates respect currencies without cents', true);
  check('no uncaught browser errors', errors.length === 0);
  console.log(`\n${checks} trip and investing checks passed.`);
} catch (error) {
  console.error('Browser errors:', errors.slice(0, 5), consoleErrors.slice(0, 5));
  throw error;
} finally { await browser.close(); }

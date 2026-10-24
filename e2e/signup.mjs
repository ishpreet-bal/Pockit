/**
 * Registering a throwaway account, with the one failure that wastes the most time
 * turned into a sentence.
 *
 * Sign-up is rate limited to 5 attempts per hour per IP — a real safeguard, and
 * correct. But a suite that signs up on every run exhausts it, and the symptom is a
 * bare `waitForURL` timeout that looks like a broken app. This reads the form's own
 * error and says what actually happened.
 */
export async function signUp(
  page,
  base,
  { email, password = 'correcthorse1', displayName, skipOnboarding = true } = {},
) {
  const address = email ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto(`${base}/sign-up`, { waitUntil: 'domcontentloaded' });

  // Sign-up opens on the name question now, and the email field does not exist
  // until that screen is passed. Handled here rather than in each suite, because
  // every suite that registers an account goes through this helper.
  await page.waitForSelector('#firstName, #email', { timeout: 30000 });
  if (await page.locator('#firstName').count()) {
    // The name is required to continue, so a suite that does not care still gives one.
    await page.fill('#firstName', displayName ?? 'Tester');
    await page.click('button:has-text("Continue")');
    await page.waitForSelector('#email', { timeout: 30000 });
  }

  await page.fill('#email', address);
  await page.fill('#password', password);
  await page.click('button[type=submit]');

  try {
    await page.waitForURL(/onboarding|overview/, { timeout: 30000 });
  } catch {
    const alert = await page.locator('[role=alert]').first().textContent().catch(() => null);
    if (alert && /too many/i.test(alert)) {
      throw new Error(
        'Sign-up is rate limited (5 per hour per IP) and this suite has used them up.\n' +
        'That is the app working as intended, not a failure. Either wait, or clear the\n' +
        "counter on a local test database:\n" +
        `  psql "$DATABASE_URL" -c "DELETE FROM pockit.rate_limits WHERE key LIKE 'signup%'"`,
      );
    }
    throw new Error(`Registration did not redirect.${alert ? ` The form said: ${alert}` : ''}`);
  }

  // A new account now lands in first-run setup rather than the dashboard. Suites
  // that only need AN ACCOUNT should not each re-implement stepping through it, and
  // a suite about imports has no business asserting onboarding copy.
  if (skipOnboarding && /onboarding/.test(page.url())) {
    await page.waitForSelector('button:has-text("Skip for now")', { timeout: 30000 });
    await page.click('button:has-text("Skip for now")');
    await page.waitForURL(/overview/, { timeout: 40000 });
    // The tour now opens by itself after setup. A suite about imports should not
    // have to know that, so it is dismissed here — with Escape, as a person could.
    await page.waitForSelector('[role=dialog]', { timeout: 8000 }).catch(() => {});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  // Mark every section's walkthrough as seen, so the "Explore this page" pill never
  // floats over the button a test is about to click.
  await page.evaluate(() => {
    try {
      localStorage.setItem('pockit-explored', JSON.stringify(
        ['/overview', '/transactions', '/budget', '/goals', '/calendar', '/investing'],
      ));
    } catch { /* ignore */ }
  });

  return address;
}

/**
 * Registering a throwaway account, with the one failure that wastes the most time
 * turned into a sentence.
 *
 * Sign-up is rate limited to 5 attempts per hour per IP — a real safeguard, and
 * correct. But a suite that signs up on every run exhausts it, and the symptom is a
 * bare `waitForURL` timeout that looks like a broken app. This reads the form's own
 * error and says what actually happened.
 */
export async function signUp(page, base, { email, password = 'correcthorse1', displayName } = {}) {
  const address = email ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto(`${base}/sign-up`, { waitUntil: 'domcontentloaded' });
  if (displayName) await page.fill('#displayName', displayName);
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

  return address;
}

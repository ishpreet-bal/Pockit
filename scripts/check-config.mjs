import { existsSync, readFileSync } from 'node:fs';
import { config, parse } from 'dotenv';

config({ path: '.env.local', quiet: true });
config({ quiet: true });
const mobile = {
  ...(existsSync('mobile/.env') ? parse(readFileSync('mobile/.env')) : {}),
  ...process.env,
};
const present = (key, source = process.env) => Boolean(source[key]?.trim());
const check = (label, keys, source = process.env) => {
  const missing = keys.filter((key) => !present(key, source));
  console.log(`${label}: ${missing.length ? `missing ${missing.join(', ')}` : 'configured (not verified)'}`);
};

console.log('Configuration presence only. No external calls are made and no secret values are printed.\n');
check('Core app', ['DATABASE_URL', 'AUTH_SECRET']);
check('Migration setup page', ['ADMIN_SECRET']);
const selected = process.env.AI_PROVIDER?.trim() || 'auto';
const ai = selected === 'auto'
  ? present('ANTHROPIC_API_KEY') ? 'anthropic' : present('OPENAI_API_KEY') ? 'openai' : 'heuristic'
  : selected;
if (ai === 'anthropic' || ai === 'openai') check(`AI (${ai})`, [ai === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY']);
else console.log(`AI (${ai}): chat and image extraction disabled; set OPENAI_API_KEY or ANTHROPIC_API_KEY with AI_PROVIDER=auto`);
check('Market quotes and charts', ['TWELVEDATA_API_KEY']);
if (present('FINNHUB_API_KEY')) console.log(`Finnhub: ${present('TWELVEDATA_API_KEY') ? 'not selected; Twelve Data takes precedence' : 'selected; historical chart access depends on the account plan'}`);
check('Password reset email', ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL']);
check('Bank connections', ['PLAID_CLIENT_ID', 'PLAID_SECRET']);
console.log(`Plaid mode: ${process.env.PLAID_ENV?.trim() === 'production' ? 'production (requires provider access)' : 'sandbox/test banks'}`);
check('Google trip search/routing (optional)', ['GOOGLE_MAPS_API_KEY']);
check('Support contact', ['SUPPORT_EMAIL']);
check('Admin access (optional)', ['ADMIN_EMAILS']);
const plus = process.env.PLUS_ENABLED?.trim() === 'true';
console.log(`Paid subscriptions: ${plus ? 'enabled' : 'disabled; everyone has unrestricted access'}`);
if (plus) {
  check('Subscription webhook', ['REVENUECAT_WEBHOOK_SECRET']);
  check('iOS purchase SDK', ['EXPO_PUBLIC_REVENUECAT_IOS_KEY'], mobile);
}
check('Mobile backend', ['EXPO_PUBLIC_API_URL'], mobile);
if (process.env.STORAGE_DRIVER?.trim() === 'supabase') check('Supabase file storage', ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_BUCKET']);
if (process.env.STORAGE_DRIVER?.trim() === 'vercel_blob') console.log('Vercel Blob: not implemented; uploads currently fall back to PostgreSQL');
console.log('\nSee docs/INTEGRATIONS.md for provider setup, limits, and features that need code rather than keys.');

import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { PlaidAccount, PlaidTxn } from './map';

/**
 * A thin Plaid client — plain fetch, no SDK, only the calls Pockit uses.
 *
 * Configured with PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV ('sandbox' until
 * Plaid approves production). Without them every bank feature says it isn't
 * set up yet instead of failing.
 */

const ENV = () => (process.env.PLAID_ENV?.trim() || 'sandbox') as 'sandbox' | 'production';
export const plaidConfigured = () => Boolean(process.env.PLAID_CLIENT_ID?.trim() && process.env.PLAID_SECRET?.trim());

export class PlaidError extends Error {
  constructor(message: string, readonly code: string | null, readonly status: number) { super(message); }
}

/**
 * Plaid's address. PLAID_API_BASE exists only for tests, which point it at a local
 * stand-in (e2e/fake-plaid.mjs); it is refused in production so a stray variable can
 * never send the keys anywhere but Plaid.
 */
function base(): string {
  const override = process.env.PLAID_API_BASE?.trim();
  if (override && process.env.NODE_ENV !== 'production' && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(override)) return override;
  return `https://${ENV()}.plaid.com`;
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  // The keys travel in Plaid's own headers rather than the body, so they never sit
  // in a request body that might be logged.
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID?.trim() ?? '',
      'PLAID-SECRET': process.env.PLAID_SECRET?.trim() ?? '',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new PlaidError(String(json.error_message ?? `Plaid ${res.status}`), (json.error_code as string) ?? null, res.status);
  return json as T;
}

/** A Link session. `hosted` gives a URL the phone can open in a browser — no native SDK needed. */
export async function createLinkToken(userId: string, opts: { hosted: boolean; accessToken?: string }) {
  return call<{ link_token: string; hosted_link_url?: string; expiration: string }>('/link/token/create', {
    user: { client_user_id: userId },
    client_name: 'Pockit',
    language: 'en',
    country_codes: ['CA', 'US'],
    // Update mode (reconnecting a broken login) passes the existing token instead of products.
    ...(opts.accessToken ? { access_token: opts.accessToken } : { products: ['transactions'], transactions: { days_requested: 180 } }),
    ...(opts.hosted ? { hosted_link: {} } : {}),
  });
}

/** After someone finishes Link: the public token and the bank they chose, if they finished. */
export async function linkResult(linkToken: string): Promise<{ publicToken: string; institution: string | null } | null> {
  const r = await call<{ link_sessions?: { results?: { item_add_results?: { public_token: string; institution?: { name?: string } }[] } }[] }>('/link/token/get', { link_token: linkToken });
  for (const s of r.link_sessions ?? []) {
    const add = s.results?.item_add_results?.[0];
    if (add?.public_token) return { publicToken: add.public_token, institution: add.institution?.name ?? null };
  }
  return null;
}

/**
 * Update mode (signing in again to a bank Pockit already has): there is no new token
 * to collect, only whether they finished. A session that finished, or reported a
 * success, means try syncing; the sync itself is the real test that the login works.
 */
export async function linkFinished(linkToken: string): Promise<boolean> {
  const r = await call<{ link_sessions?: { finished_at?: string | null; on_success?: unknown; results?: unknown }[] }>('/link/token/get', { link_token: linkToken });
  return (r.link_sessions ?? []).some((s) => Boolean(s.finished_at || s.on_success || s.results));
}

export const exchangePublicToken = (publicToken: string) =>
  call<{ access_token: string; item_id: string }>('/item/public_token/exchange', { public_token: publicToken });

export const getAccounts = (accessToken: string) =>
  call<{ accounts: PlaidAccount[]; item: { institution_id?: string | null } }>('/accounts/get', { access_token: accessToken });

export async function syncTransactions(accessToken: string, cursor: string | null) {
  const added: PlaidTxn[] = [], modified: PlaidTxn[] = [], removed: { transaction_id: string }[] = [];
  let next = cursor ?? undefined;
  for (let page = 0; page < 20; page++) {
    const r = await call<{ added: PlaidTxn[]; modified: PlaidTxn[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean }>(
      '/transactions/sync', { access_token: accessToken, ...(next ? { cursor: next } : {}), count: 500 });
    added.push(...r.added); modified.push(...r.modified); removed.push(...r.removed);
    next = r.next_cursor;
    if (!r.has_more) break;
  }
  return { added, modified, removed, cursor: next ?? null };
}

export const removeItem = (accessToken: string) => call('/item/remove', { access_token: accessToken });

/* ---------------- the access token never sits in the database in plain text ---------------- */

const key = () => createHash('sha256').update(`pockit-bank-token:${process.env.AUTH_SECRET ?? ''}`).digest();

export function sealToken(token: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** The stored bank token can't be opened: written under a different AUTH_SECRET, or damaged. Only a reconnect fixes it. */
export class TokenUnreadable extends Error {}

export function openToken(sealed: string): string {
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !body) throw new TokenUnreadable('Unreadable bank token');
  try {
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
  } catch {
    throw new TokenUnreadable('Unreadable bank token');
  }
}

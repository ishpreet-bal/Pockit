import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { api, ApiError } from './api';

/**
 * Connecting a bank through Plaid's hosted page: the person signs in to their
 * bank on Plaid's secure site (Pockit never sees the password), then comes back
 * and we collect the result. Works in Expo Go and the browser preview — no
 * native SDK needed.
 */

export interface Connection { id: string; institution: string | null; status: 'active' | 'reconnect' | 'error'; error: string | null; lastSyncedAt: string | null }

export async function listConnections() {
  return api<{ available: boolean; connections: Connection[] }>('/api/mobile/bank');
}

interface Pending { linkToken: string; ticket: string; connectionId?: string; at: number }
const PENDING = 'pockit.bankPending';
const savePending = (p: Pending | null) => {
  if (Platform.OS !== 'web') return;
  try { if (p) sessionStorage.setItem(PENDING, JSON.stringify(p)); else sessionStorage.removeItem(PENDING); } catch { /* private mode */ }
};

/** Opens the bank page, waits for them to finish, then stores and syncs. Resolves with the bank's name, or null if they backed out. */
export async function connectBank(onStatus: (s: string) => void, connectionId?: string): Promise<string | null> {
  // Phone browsers (Safari above all) only open a new tab straight from a tap, so
  // the tab opens now and is pointed at the bank's page once the link is ready.
  // Opened later, after the request below, it would be blocked as a pop-up.
  const tab = Platform.OS === 'web' ? window.open('', '_blank') : null;
  if (tab) { try { tab.document.title = 'Connecting your bank…'; tab.document.body.innerHTML = '<p style="font:16px -apple-system,system-ui,sans-serif;padding:24px;color:#555">Opening your bank’s secure page…</p>'; } catch { /* cross-origin already */ } }
  let link: { linkToken: string; ticket: string; url: string | null };
  try {
    // With connectionId: the same bank signing in again, keeping its accounts and history.
    link = await api<{ linkToken: string; ticket: string; url: string | null }>('/api/mobile/bank/link', { method: 'POST', body: connectionId ? { connectionId } : {} });
    if (!link.url) throw new Error('Plaid didn’t return a page to open.');
  } catch (e) { tab?.close(); throw e; }
  const pending: Pending = { linkToken: link.linkToken, ticket: link.ticket, connectionId, at: Date.now() };
  onStatus('Sign in to your bank on the secure page…');
  if (Platform.OS === 'web') {
    // Remembered for this tab, so a phone that reloads Pockit while you're at the bank picks up where it left off.
    savePending(pending);
    if (tab) { tab.opener = null; tab.location.href = link.url; }
    else { window.location.assign(link.url); return null; }
  } else {
    await WebBrowser.openBrowserAsync(link.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
  }
  return waitForBank(pending, onStatus);
}

/** A connection started in this browser tab and not finished yet (the page was reloaded meanwhile). */
export function pendingBank(): Pending | null {
  if (Platform.OS !== 'web') return null;
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') as Pending | null;
    if (p && Date.now() - p.at < 30 * 60_000) return p;
    savePending(null);
  } catch { /* nothing pending */ }
  return null;
}

let resuming = false;
/** Finish a connection this tab started before it reloaded. Only the first caller gets it. */
export function claimPendingBank(): Pending | null {
  if (resuming) return null;
  const p = pendingBank();
  if (p) resuming = true;
  return p;
}
export const resumeClaimed = () => resuming;

/** Ask whether they finished at the bank: every 2 seconds, for up to ~3 minutes. */
export async function waitForBank(p: Pending, onStatus: (s: string) => void): Promise<string | null> {
  onStatus('Waiting for your bank…');
  try {
    for (let i = 0; i < 90; i++) {
      const r = await api<{ done: boolean; institution?: string | null }>('/api/mobile/bank/complete', { body: p.connectionId ? { linkToken: p.linkToken, ticket: p.ticket, connectionId: p.connectionId } : { linkToken: p.linkToken, ticket: p.ticket } });
      if (r.done) { savePending(null); return r.institution ?? 'your bank'; }
      await new Promise((res) => setTimeout(res, 2000));
    }
    return null;
  } catch (e) {
    // A request cut off by the page reloading isn't an answer: keep it for when Pockit opens again.
    if (e instanceof ApiError && e.status !== 0) savePending(null);
    throw e;
  }
}

export const syncBanks = () => api<{ synced: { id: string; ok: boolean }[] }>('/api/mobile/bank/sync', { method: 'POST' });
export const disconnectBank = (id: string) => api(`/api/mobile/bank?id=${encodeURIComponent(id)}`, { method: 'DELETE' });

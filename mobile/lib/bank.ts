import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { api } from './api';

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

/** Opens the bank page, waits for them to finish, then stores and syncs. Resolves with the bank's name, or null if they backed out. */
export async function connectBank(onStatus: (s: string) => void, connectionId?: string): Promise<string | null> {
  // With connectionId: the same bank signing in again, keeping its accounts and history.
  const { linkToken, url } = await api<{ linkToken: string; url: string | null }>('/api/mobile/bank/link', { method: 'POST', body: connectionId ? { connectionId } : {} });
  if (!url) throw new Error('Plaid didn’t return a page to open.');
  onStatus('Sign in to your bank on the secure page…');
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
  else await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });

  // They might still be on the bank's page (web) or just closed it (phone). Ask for up to ~3 minutes.
  onStatus('Waiting for your bank…');
  for (let i = 0; i < 90; i++) {
    const r = await api<{ done: boolean; institution?: string | null }>('/api/mobile/bank/complete', { body: connectionId ? { linkToken, connectionId } : { linkToken } });
    if (r.done) return r.institution ?? 'your bank';
    await new Promise((res) => setTimeout(res, 2000));
  }
  return null;
}

export const syncBanks = () => api<{ synced: { id: string; ok: boolean }[] }>('/api/mobile/bank/sync', { method: 'POST' });
export const disconnectBank = (id: string) => api(`/api/mobile/bank?id=${encodeURIComponent(id)}`, { method: 'DELETE' });

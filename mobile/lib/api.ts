import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Talking to the Pockit server.
 *
 * The session token lives in the iOS Keychain (expo-secure-store). In the browser
 * preview it lives in this tab's session storage — gone when the tab closes.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const KEY = 'pockit.session';

/** Which space (Personal, or a shared household) the app is looking at. Sent on every request. */
let activeSpace: string | null = null;
export function setActiveSpace(id: string | null) { activeSpace = id; }
export function getActiveSpace() { return activeSpace; }
let memoryToken: string | null = null;
const tab = () => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; } };

export async function readToken(): Promise<string | null> {
  if (Platform.OS === 'web') return memoryToken ?? tab()?.getItem(KEY) ?? null;
  return SecureStore.getItemAsync(KEY);
}

export async function writeToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    memoryToken = token;
    try { if (token) tab()?.setItem(KEY, token); else tab()?.removeItem(KEY); } catch { /* private mode */ }
    return;
  }
  if (token) await SecureStore.setItemAsync(KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  else await SecureStore.deleteItemAsync(KEY);
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown>) { super(message); }
}

/** JSON in, JSON out, with the session attached. Errors carry the server's own sentence. */
export async function api<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await readToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(activeSpace ? { 'x-pockit-space': activeSpace } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError('Can’t reach Pockit right now. Check your connection and try again.', 0, {});
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof body.error === 'string' ? body.error : 'Something went wrong. Please try again.';
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, readToken, writeToken } from './api';
import { configurePurchases } from './purchases';

export interface Me {
  id?: string;
  name: string | null;
  email: string;
  setupDone: boolean;
  /** Runs Pockit: always has Plus, sees the Developer screen. Decided by the server (ADMIN_EMAILS). */
  admin?: boolean;
  /** Whether Pockit Plus has launched. While false, the app shows no trace of it. */
  plusEnabled?: boolean;
  plus?: boolean;
  plusUntil?: string | null;
  /** Null when unlimited. */
  pockLeftThisMonth?: number | null;
}

interface SessionValue {
  status: 'loading' | 'signed-out' | 'signed-in';
  me: Me | null;
  /** Store a token from sign-in or sign-up, then load who it belongs to. */
  adopt: (token: string) => Promise<Me | null>;
  refresh: () => Promise<Me | null>;
  signOut: () => Promise<void>;
  /** Exploring with sample data, no account. Nothing is sent to the server. */
  demo: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
}

const Ctx = createContext<SessionValue | null>(null);

/**
 * Sample-data mode. Screens read this to show sample figures and to skip every
 * call that would change something on the server.
 *
 * It's on from the start in design-review builds (EXPO_PUBLIC_PREVIEW=1), and
 * switched on at runtime by "Look around first" on the welcome screen — the demo.
 * A live binding: modules that import it see the new value on their next render.
 */
export let PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';
const DEMO_ME: Me = { name: 'Alex', email: 'demo@pockit.app', setupDone: true };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionValue['status']>(PREVIEW ? 'signed-in' : 'loading');
  const [me, setMe] = useState<Me | null>(PREVIEW ? { name: 'Ish', email: 'preview@pockit.app', setupDone: true } : null);
  const [demo, setDemo] = useState(false);

  const refresh = useCallback(async () => {
    if (PREVIEW) return me;
    if (!(await readToken())) { setMe(null); setStatus('signed-out'); return null; }
    try {
      const next = await api<Me>('/api/mobile/me');
      setMe(next); setStatus('signed-in');
      if (next.plusEnabled && next.id) configurePurchases(next.id);
      return next;
    } catch (e) {
      // Only a rejected token signs you out; being offline must not.
      if (e instanceof ApiError && e.status === 401) { await writeToken(null); setMe(null); setStatus('signed-out'); }
      else if (status === 'loading') setStatus('signed-out');
      return null;
    }
  }, [me, status]);

  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<SessionValue>(() => ({
    status, me, refresh, demo,
    enterDemo: () => { PREVIEW = true; setDemo(true); setMe(DEMO_ME); setStatus('signed-in'); },
    exitDemo: () => { PREVIEW = false; setDemo(false); setMe(null); setStatus('signed-out'); },
    adopt: async (token) => { await writeToken(token); return refresh(); },
    signOut: async () => {
      try { await api('/api/mobile/auth/sign-out', { method: 'POST' }); } catch { /* revoke is best effort */ }
      await writeToken(null); setMe(null); setStatus('signed-out');
    },
  }), [status, me, refresh, demo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

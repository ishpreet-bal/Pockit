import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, readToken, writeToken } from './api';

export interface Me { name: string | null; email: string; setupDone: boolean }

interface SessionValue {
  status: 'loading' | 'signed-out' | 'signed-in';
  me: Me | null;
  /** Store a token from sign-in or sign-up, then load who it belongs to. */
  adopt: (token: string) => Promise<Me | null>;
  refresh: () => Promise<Me | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

/**
 * Design screenshots run without a server. With EXPO_PUBLIC_PREVIEW=1 the app acts
 * signed in with setup finished, so every screen can be reviewed on its own.
 */
export const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionValue['status']>(PREVIEW ? 'signed-in' : 'loading');
  const [me, setMe] = useState<Me | null>(PREVIEW ? { name: 'Ish', email: 'preview@pockit.app', setupDone: true } : null);

  const refresh = useCallback(async () => {
    if (PREVIEW) return me;
    if (!(await readToken())) { setMe(null); setStatus('signed-out'); return null; }
    try {
      const next = await api<Me>('/api/mobile/me');
      setMe(next); setStatus('signed-in');
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
    status, me, refresh,
    adopt: async (token) => { await writeToken(token); return refresh(); },
    signOut: async () => {
      try { await api('/api/mobile/auth/sign-out', { method: 'POST' }); } catch { /* revoke is best effort */ }
      await writeToken(null); setMe(null); setStatus('signed-out');
    },
  }), [status, me, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

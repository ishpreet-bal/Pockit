import { restoreSpace, switchSpace } from './spaces';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, readToken, writeToken } from './api';
import { configurePurchases } from './purchases';

export interface Me {
  id?: string;
  name: string | null;
  /** Null for a guest, whose address is only a placeholder. */
  email: string | null;
  /** Looking around with sample money on a temporary account. */
  guest?: boolean;
  /** The AI company Pock's answers come from (null: no AI configured), and whether this person allowed it. */
  aiProvider?: string | null;
  aiConsent?: boolean;
  setupDone: boolean;
  /** Has seen (or skipped) the walkthrough. */
  tourDone?: boolean;
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
  /**
   * Offline sample mode: only when "Look around first" can't reach the server, and
   * in design-review builds. Normally looking around is a guest account (me.guest).
   */
  demo: boolean;
  /** "Look around first": a guest account with sample money, or offline samples if the server can't be reached. */
  enterDemo: () => Promise<void>;
  exitDemo: () => void;
  /** Stop looking around: the guest and its sample money are deleted. */
  endGuest: () => Promise<void>;
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
    await restoreSpace();
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
    enterDemo: async () => {
      try {
        const { token } = await api<{ token: string }>('/api/mobile/auth/guest', { method: 'POST' });
        await writeToken(token);
        await refresh();
      } catch {
        // No server to look around on: the offline samples still show what Pockit does.
        PREVIEW = true; setDemo(true); setMe(DEMO_ME); setStatus('signed-in');
      }
    },
    endGuest: async () => {
      try { await api('/api/account/guest/end', { method: 'POST' }); } catch { /* purged after a few days anyway */ }
      await switchSpace(null);
      await writeToken(null); setMe(null); setStatus('signed-out');
    },
    exitDemo: () => { PREVIEW = false; setDemo(false); setMe(null); setStatus('signed-out'); },
    adopt: async (token) => { await writeToken(token); return refresh(); },
    signOut: async () => {
      // Signing out of a guest would strand it: delete it instead.
      if (me?.guest) {
        try { await api('/api/account/guest/end', { method: 'POST' }); } catch { /* purged later */ }
        await switchSpace(null); await writeToken(null); setMe(null); setStatus('signed-out');
        return;
      }
      await switchSpace(null);
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

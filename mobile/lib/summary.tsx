import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { PREVIEW, useSession } from './session';
import { previewSummary } from '@/data/preview';
import { checkBudgetAlerts, syncBillReminders } from './reminders';

export interface Summary {
  currency: string;
  today: string;
  hasData: boolean;
  hasBalance: boolean;
  /** Bank connection: switched on for this server, and whether this person has connected one. */
  bank?: { available: boolean; connected: boolean };
  /** The space being viewed — a shared household shows its name on Home. */
  space?: { name: string; shared: boolean };
  /** Split expenses still waiting on money back. */
  owed?: { minor: number; count: number };
  home: {
    safeToSpendMinor: number;
    explanation: string;
    short: boolean;
    daysLeft: number;
    nextIncome: { name: string; date: string; amountMinor: number } | null;
    upcoming: { name: string; date: string; amountMinor: number }[];
    /** Credit card payments coming up (reminders: card balances already count against safe to spend). */
    cards?: CardDue[];
    trend: { month: string; netMinor: number }[];
  };
  spending: {
    spentMinor: number;
    spentDeltaMinor: number | null;
    periodStart?: string;
    periodEnd?: string;
    daily?: { date: string; amountMinor: number }[];
    budgetMinor: number | null;
    categories: { id: string; name: string; icon: string | null; amountMinor: number; budgetMinor: number | null }[];
    recent: { id: string; name: string; date: string; amountMinor: number; icon: string | null; category: string | null }[];
  };
  goals: {
    id: string; name: string; currentMinor: number; targetMinor: number; targetDate: string | null;
    monthlyMinor: number | null; achieved: boolean; status: 'done' | 'open' | 'behind' | 'on_track';
  }[];
  invest: {
    totalValueMinor: number;
    gainMinor: number;
    gainPct: number | null;
    totals?: { currency: string; valueMinor: number; gainMinor: number; gainPct: number | null; recordedCount: number }[];
    holdings: { id?: string; symbol: string | null; name: string; currency?: string; valueMinor: number; gainMinor: number; changePct: number | null; valuation?: 'quote' | 'recorded'; source?: string; asOf?: string | null }[];
    watchlist: { symbol: string; name: string; currency?: string | null; priceMinor: number | null; changePct: number | null; simulated?: boolean; source?: string | null; asOf?: string | null }[];
  };
}

interface SummaryValue {
  data: Summary | null;
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SummaryValue | null>(null);

/**
 * One request feeds all four tabs, loaded once when the tabs appear and again on
 * pull-to-refresh. The last good copy stays on screen if a refresh fails, so a
 * dropped connection shows a note rather than blanking someone's balance.
 */
/** Connected banks catch up in the background (only if stale), then the numbers refresh again. */
function catchUp(refresh: () => Promise<void>) {
  void api<{ synced: { ok: boolean; added?: number; updated?: number }[] }>('/api/mobile/bank/sync', { body: { ifStale: true } })
    .then((r) => { if (r.synced.some((x) => x.ok)) void refresh(); }).catch(() => {});
}

export function SummaryProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [data, setData] = useState<Summary | null>(PREVIEW ? previewSummary : null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (PREVIEW) return;
    setRefreshing(true);
    try {
      const next = await api<Summary>('/api/mobile/summary');
      setData(next);
      // Fresh bills mean fresh reminders; failures here never block the numbers.
      void syncBillReminders(next).catch(() => {});
      void checkBudgetAlerts(next).catch(() => {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your numbers.');
    } finally { setRefreshing(false); }
  }, []);

  const { demo } = useSession();
  useEffect(() => {
    // Demo shows sample figures; leaving it (or signing out) must not leave them behind.
    if (PREVIEW) { setData(previewSummary); return; }
    if (status === 'signed-in') {
      void refresh();
      catchUp(refresh);
    }
    else setData(null);
  }, [status, demo, refresh]);

  // Coming back to Pockit after a while: banks catch up (if they haven't in the
  // last half hour) and the numbers refresh, so new purchases are just there.
  useEffect(() => {
    if (status !== 'signed-in' || PREVIEW) return;
    let away = 0;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { away = Date.now(); return; }
      if (away && Date.now() - away > 5 * 60_000) { void refresh(); catchUp(refresh); }
    });
    return () => sub.remove();
  }, [status, refresh]);

  return <Ctx.Provider value={{ data, error, refreshing, refresh }}>{children}</Ctx.Provider>;
}

export function useSummary() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSummary outside SummaryProvider');
  return v;
}

export interface CardDue {
  id: string; name: string; mask: string | null; dueDate: string; daysLeft: number;
  statementMinor: number | null; minimumMinor: number | null; paid: boolean; source: 'statement' | 'day';
}

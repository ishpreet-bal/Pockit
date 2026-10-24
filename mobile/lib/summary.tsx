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
    holdings: { symbol: string; name: string; valueMinor: number; gainMinor: number; changePct: number | null }[];
    watchlist: { symbol: string; name: string; priceMinor: number | null; changePct: number | null }[];
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
      // Connected banks catch up in the background, then the numbers refresh again.
      void api<{ synced: { ok: boolean }[] }>('/api/mobile/bank/sync', { method: 'POST' })
        .then((r) => { if (r.synced.some((x) => x.ok)) void refresh(); }).catch(() => {});
    }
    else setData(null);
  }, [status, demo, refresh]);

  return <Ctx.Provider value={{ data, error, refreshing, refresh }}>{children}</Ctx.Provider>;
}

export function useSummary() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSummary outside SummaryProvider');
  return v;
}

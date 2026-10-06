import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getPref, getText, setText } from './prefs';
import type { Summary } from './summary';

/**
 * Bill reminders, scheduled on the phone itself — no server, no push service.
 *
 * Each upcoming bill gets one notification at 9am the day before it's due. The
 * whole set is rebuilt every time fresh numbers arrive, so a paid or removed bill
 * never pings, and nothing piles up.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function askForNotifications(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

const money = (minor: number) => `$${(minor / 100).toLocaleString('en-CA', { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export async function syncBillReminders(summary: Summary | null): Promise<number> {
  if (Platform.OS === 'web') return 0;
  // Only clear bill reminders — budget alerts and the weekly summary are separate.
  for (const n of await Notifications.getAllScheduledNotificationsAsync()) if (n.identifier.startsWith('bill-')) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  if (!summary || !(await getPref('billReminders'))) return 0;
  if (!(await Notifications.getPermissionsAsync()).granted) return 0;

  let scheduled = 0;
  for (const bill of summary.home.upcoming) {
    const [y, m, d] = bill.date.split('-').map(Number) as [number, number, number];
    const when = new Date(y, m - 1, d - 1, 9, 0, 0);
    if (when.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `bill-${bill.name}-${bill.date}`,
      content: { title: `${bill.name} is due tomorrow`, body: `${money(bill.amountMinor)} — it’s already set aside in what you can spend.` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
    scheduled++;
  }
  return scheduled;
}

/** Developer tool: a sample reminder a few seconds from now, to check notifications work on this phone. */
export async function sendTestReminder(): Promise<boolean> {
  if (Platform.OS === 'web' || !(await askForNotifications())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Rent is due tomorrow', body: '$1,800 — it’s already set aside in what you can spend. (Test reminder)' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
  });
  return true;
}

/**
 * A nudge when a category budget reaches 80%, and again if it goes over — once
 * each per category per period, never a stream of the same warning.
 */
export async function checkBudgetAlerts(summary: Summary | null): Promise<void> {
  if (Platform.OS === 'web' || !summary || !(await getPref('budgetAlerts'))) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  const period = summary.today.slice(0, 7);
  let sent: string[] = [];
  try { sent = JSON.parse((await getText('alertsSent')) ?? '[]') as string[]; } catch { /* first time */ }
  sent = sent.filter((k) => k.startsWith(period));
  for (const cat of summary.spending.categories) {
    if (!cat.budgetMinor) continue;
    const pct = cat.amountMinor / cat.budgetMinor;
    const level = pct > 1 ? 'over' : pct >= 0.8 ? '80' : null;
    if (!level) continue;
    const key = `${period}:${cat.id}:${level}`;
    if (sent.includes(key)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `alert-${key}`,
      content: level === 'over'
        ? { title: `${cat.name} is over budget`, body: `${money(cat.amountMinor - cat.budgetMinor)} over your ${money(cat.budgetMinor)} plan this month.` }
        : { title: `${cat.name}: ${Math.round(pct * 100)}% used`, body: `${money(cat.budgetMinor - cat.amountMinor)} left for the rest of the month.` },
      trigger: null,
    });
    sent.push(key);
  }
  await setText('alertsSent', JSON.stringify(sent));
}

/** Sundays at 6pm: a gentle look back at the week. */
export async function syncWeeklySummary(on: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync('weekly-summary').catch(() => {});
  if (!on || !(await Notifications.getPermissionsAsync()).granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: 'weekly-summary',
    content: { title: 'Your week in Pockit', body: 'See what went out this week and what’s left before payday.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 18, minute: 0 },
  });
}

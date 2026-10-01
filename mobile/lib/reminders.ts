import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getPref } from './prefs';
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
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!summary || !(await getPref('billReminders'))) return 0;
  if (!(await Notifications.getPermissionsAsync()).granted) return 0;

  let scheduled = 0;
  for (const bill of summary.home.upcoming) {
    const [y, m, d] = bill.date.split('-').map(Number) as [number, number, number];
    const when = new Date(y, m - 1, d - 1, 9, 0, 0);
    if (when.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
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

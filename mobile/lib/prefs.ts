import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Small on-device settings (Face ID lock, reminders). Kept in the Keychain alongside the session. */
export type PrefKey = 'faceId' | 'billReminders' | 'budgetAlerts' | 'weeklySummary';

const memory = new Map<string, string>();

export async function getPref(key: PrefKey): Promise<boolean> {
  const raw = Platform.OS === 'web' ? memory.get(key) : await SecureStore.getItemAsync(`pockit.pref.${key}`);
  return raw === '1';
}

export async function setPref(key: PrefKey, on: boolean): Promise<void> {
  if (Platform.OS === 'web') { memory.set(key, on ? '1' : '0'); return; }
  await SecureStore.setItemAsync(`pockit.pref.${key}`, on ? '1' : '0');
}

/** Light / dark / match the phone. */
export async function getAppearance(): Promise<'system' | 'light' | 'dark'> {
  const raw = Platform.OS === 'web' ? memory.get('appearance') : await SecureStore.getItemAsync('pockit.pref.appearance');
  return raw === 'dark' || raw === 'system' ? raw : 'light';
}

export async function saveAppearance(value: 'system' | 'light' | 'dark'): Promise<void> {
  if (Platform.OS === 'web') { memory.set('appearance', value); return; }
  await SecureStore.setItemAsync('pockit.pref.appearance', value);
}

/** Small free-text settings kept on this device (investing level, lessons read). */
export type TextKey = 'investLevel' | 'learnDone' | 'alertsSent' | 'space';
export async function getText(key: TextKey): Promise<string | null> {
  try { return Platform.OS === 'web' ? (globalThis.localStorage?.getItem(`pockit.${key}`) ?? memory.get(key) ?? null) : await SecureStore.getItemAsync(`pockit.pref.${key}`); }
  catch { return memory.get(key) ?? null; }
}
export async function setText(key: TextKey, value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') { if (value === null) { memory.delete(key); globalThis.localStorage?.removeItem(`pockit.${key}`); } else { memory.set(key, value); globalThis.localStorage?.setItem(`pockit.${key}`, value); } return; }
    if (value === null) await SecureStore.deleteItemAsync(`pockit.pref.${key}`); else await SecureStore.setItemAsync(`pockit.pref.${key}`, value);
  } catch { if (value === null) memory.delete(key); else memory.set(key, value); }
}
export async function lessonsRead(): Promise<string[]> {
  try { return JSON.parse((await getText('learnDone')) ?? '[]') as string[]; } catch { return []; }
}
export async function markLessonRead(id: string): Promise<void> {
  const done = await lessonsRead();
  if (!done.includes(id)) await setText('learnDone', JSON.stringify([...done, id]));
}

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Small on-device settings (Face ID lock, reminders). Kept in the Keychain alongside the session. */
export type PrefKey = 'faceId' | 'billReminders';

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
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export async function saveAppearance(value: 'system' | 'light' | 'dark'): Promise<void> {
  if (Platform.OS === 'web') { memory.set('appearance', value); return; }
  await SecureStore.setItemAsync('pockit.pref.appearance', value);
}

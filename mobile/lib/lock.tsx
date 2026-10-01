import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { PockMark } from '@/components/Pock';
import { Button } from '@/components/form';
import { getPref } from './prefs';
import { useSession } from './session';
import { space, type, useColors } from '@/theme/tokens';

/** How long the app can sit in the background before it asks for Face ID again. */
const GRACE_MS = 60_000;

/** Can this phone do Face ID / Touch ID, and is it set up? */
export async function biometricsAvailable() {
  if (Platform.OS === 'web') return { ok: false, label: 'Face ID' };
  const [hardware, enrolled, kinds] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const face = kinds.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  return { ok: hardware && enrolled, label: face ? 'Face ID' : 'Touch ID' };
}

export async function confirmWithBiometrics(reason: string) {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: reason, fallbackLabel: 'Use passcode' });
  return r.success;
}

/**
 * Covers the app with a lock screen when Face ID is on: at launch, and when coming
 * back after more than a minute away. The passcode is always offered as a fallback,
 * so a failed face scan never locks someone out of their own money.
 */
export function AppLock({ children }: { children: ReactNode }) {
  const c = useColors();
  const { status } = useSession();
  const [locked, setLocked] = useState(false);
  const [label, setLabel] = useState('Face ID');
  const leftAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (await confirmWithBiometrics('Unlock Pockit')) setLocked(false);
  }, []);

  // Lock at launch if it's switched on.
  useEffect(() => {
    if (status !== 'signed-in') return;
    void (async () => {
      const [on, bio] = await Promise.all([getPref('faceId'), biometricsAvailable()]);
      setLabel(bio.label);
      if (on && bio.ok) { setLocked(true); void unlock(); }
    })();
  }, [status, unlock]);

  // Lock again after time away.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background') leftAt.current = Date.now();
      if (state === 'active' && leftAt.current && Date.now() - leftAt.current > GRACE_MS && status === 'signed-in') {
        leftAt.current = null;
        if (await getPref('faceId')) { setLocked(true); void unlock(); }
      }
    });
    return () => sub.remove();
  }, [status, unlock]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg }}>
          <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: c.section.home.soft, alignItems: 'center', justifyContent: 'center' }}>
            <PockMark size={46} color={c.section.home.accent} />
          </View>
          <Text style={[type.title3, { color: c.text }]}>Pockit is locked</Text>
          <View style={{ alignSelf: 'stretch' }}><Button label={`Unlock with ${label}`} onPress={unlock} /></View>
        </View>
      ) : null}
    </View>
  );
}

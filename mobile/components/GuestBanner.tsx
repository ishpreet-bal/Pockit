import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { radius, space, type, useColors } from '@/theme/tokens';
import { Press } from './Press';

/** In a browser tab of its own (not inside the website's phone), there's a website to go back to. */
const standaloneWeb = () => {
  if (Platform.OS !== 'web') return false;
  try { return window.top === window.self; } catch { return false; }
};

/**
 * Shown while a guest looks around: one quiet line saying the money is sample money,
 * and the way to make it real. Creating an account throws the sample money away
 * first, so the person's own numbers start clean.
 */
export function GuestBanner() {
  const c = useColors();
  const a = c.section.home;
  const { me, endGuest } = useSession();
  const [busy, setBusy] = useState(false);
  if (!me?.guest) return null;
  const web = standaloneWeb();
  return (
    <Animated.View entering={FadeIn.duration(260)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8, paddingLeft: 14, paddingRight: 6, borderRadius: radius.pill, backgroundColor: a.soft, marginBottom: space.lg }}>
      {web ? (
        <Press onPress={() => { window.location.assign('/welcome'); }} accessibilityRole="link" hitSlop={8}>
          <Text style={[type.footnote, { color: c.textMuted, fontWeight: '600' }]}>‹ Website</Text>
        </Press>
      ) : null}
      <Text style={[type.footnote, { color: c.text, flex: 1 }]} numberOfLines={1}>
        <Text style={{ fontWeight: '600' }}>Sample money</Text>
        {web ? null : <Text style={{ color: c.textMuted }}> · tap anything</Text>}
      </Text>
      <Press
        disabled={busy}
        onPress={async () => { setBusy(true); void Haptics.selectionAsync(); await endGuest(); router.replace('/sign-up'); }}
        accessibilityRole="button"
        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: a.accent, opacity: busy ? 0.7 : 1 }}>
        <Text style={[type.footnote, { color: '#ffffff', fontWeight: '600' }]}>{busy ? 'One moment…' : 'Make it mine'}</Text>
      </Press>
    </Animated.View>
  );
}

/**
 * A real account that has sample money in it (loaded on purpose, or left over from
 * looking around). One tap takes the sample out; a bank or anything the person
 * added stays exactly as it is.
 */
export function SampleDataBanner({ onCleared }: { onCleared?: () => void }) {
  const c = useColors();
  const a = c.section.home;
  const { me, refresh } = useSession();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  if (!me?.sampleData || me.guest) return null;
  const clear = async () => {
    setState('busy'); void Haptics.selectionAsync();
    try {
      await api('/api/workspace/clear-demo', { method: 'POST' });
      await refresh(); onCleared?.(); setState('idle');
    } catch { setState('error'); }
  };
  return (
    <Animated.View entering={FadeIn.duration(260)} style={{ padding: space.lg, borderRadius: radius.tile, backgroundColor: a.soft, marginBottom: space.lg, gap: 6 }}>
      <Text style={[type.headline, { color: c.text }]}>There’s sample money in your account</Text>
      <Text style={[type.footnote, { color: c.textMuted, lineHeight: 20 }]}>
        {state === 'error' ? 'That didn’t work. Check your connection and try again.' : 'Take it out so only your own money shows. Your bank and anything you added stay as they are.'}
      </Text>
      <Press disabled={state === 'busy'} onPress={clear} accessibilityRole="button"
        style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: a.accent, opacity: state === 'busy' ? 0.7 : 1 }}>
        <Text style={[type.footnote, { color: '#ffffff', fontWeight: '600' }]}>{state === 'busy' ? 'Removing…' : 'Remove sample money'}</Text>
      </Press>
    </Animated.View>
  );
}

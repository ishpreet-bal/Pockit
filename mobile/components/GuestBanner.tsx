import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSession } from '@/lib/session';
import { radius, space, type, useColors } from '@/theme/tokens';

/**
 * Shown while a guest looks around: whose money this is (nobody's), and the way to
 * make it real. Creating an account throws the sample money away first, so the
 * person's own numbers start clean.
 */
export function GuestBanner() {
  const c = useColors();
  const a = c.section.home;
  const { me, endGuest } = useSession();
  const [busy, setBusy] = useState(false);
  if (!me?.guest) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.tile, backgroundColor: a.soft, marginBottom: space.lg }}>
      <Text style={[type.footnote, { color: c.text, flex: 1, lineHeight: 18 }]}>
        <Text style={{ fontWeight: '600' }}>You’re looking around with sample money.</Text> Tap anything. Make it yours when you’re ready.
      </Text>
      <Pressable
        disabled={busy}
        onPress={async () => { setBusy(true); void Haptics.selectionAsync(); await endGuest(); router.replace('/sign-up'); }}
        accessibilityRole="button"
        style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: a.accent, opacity: pressed || busy ? 0.7 : 1 })}>
        <Text style={[type.footnote, { color: '#ffffff', fontWeight: '600' }]}>{busy ? 'One moment…' : 'Create my account'}</Text>
      </Pressable>
    </View>
  );
}

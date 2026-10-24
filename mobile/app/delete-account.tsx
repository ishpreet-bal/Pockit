import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Field, FormError, StepScreen } from '@/components/form';
import { api } from '@/lib/api';
import { PREVIEW, useSession } from '@/lib/session';
import { space, type, useColors } from '@/theme/tokens';

/**
 * Delete my account. Plain about what goes and what doesn't, and asks for the
 * password once more, because this cannot be undone.
 */
export default function DeleteAccount() {
  const c = useColors();
  const { signOut, me } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true); setError(null);
    try {
      if (!PREVIEW) await api('/api/account/delete', { body: { password } });
      await signOut();
      router.replace('/welcome');
    } catch (e) { setError(e instanceof Error ? e.message : 'Your account couldn’t be deleted. Try again.'); }
    finally { setBusy(false); }
  }

  const points = [
    'Your transactions, budgets, goals, splits and Pock conversations are deleted.',
    'Connected banks are disconnected.',
    'A shared space other people use is handed to one of them, not deleted.',
    'If you pay for Pockit Plus, cancel it in your iPhone’s Settings → Subscriptions. Apple bills it, so deleting your account doesn’t stop it.',
  ];

  return (
    <StepScreen
      top={<Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button"><Text style={[type.body, { color: c.section.more.accent }]}>Cancel</Text></Pressable>}
      title="Delete your account"
      subtitle={`This removes ${me?.email ?? 'your account'} and everything in it. It can’t be undone.`}
      footer={<Button label="Delete my account" accent={c.negative} loading={busy} disabled={!password} onPress={() => void go()} />}
    >
      <View style={{ gap: space.sm }}>
        {points.map((p) => (
          <View key={p} style={{ flexDirection: 'row', gap: 10 }}>
            <Text style={[type.body, { color: c.textMuted }]}>•</Text>
            <Text style={[type.subhead, { color: c.text, flex: 1, lineHeight: 21 }]}>{p}</Text>
          </View>
        ))}
      </View>
      <Field label="Your password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" section="more" />
      <FormError message={error} />
    </StepScreen>
  );
}

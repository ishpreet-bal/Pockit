import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { api, API_URL } from '@/lib/api';
import { useSession } from '@/lib/session';
import { radius, space, type, useColors } from '@/theme/tokens';

/**
 * Asking before anything goes to the AI company (App Store guideline 5.1.2(i)):
 * which company, exactly what is sent, and that no is fine. The server refuses AI
 * calls until the answer is yes, so this can never be skipped by accident.
 */
export function AiConsentCard({ onAllowed, onDeclined, what = 'question' }: {
  onAllowed: () => void;
  onDeclined?: () => void;
  /** What the person is about to do, for the first line. */
  what?: 'question' | 'receipt';
}) {
  const c = useColors();
  const a = c.section.home;
  const { me, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const company = me?.aiProvider ?? 'an AI company';

  async function allow() {
    setBusy(true);
    try {
      await api('/api/account/ai-consent', { body: { allow: true } });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
      onAllowed();
    } catch { /* stays on screen to try again */ }
    finally { setBusy(false); }
  }

  return (
    <View style={{ padding: space.lg, borderRadius: radius.card, backgroundColor: a.soft, gap: space.sm }}>
      <Text style={[type.bodyStrong, { color: c.text }]}>
        {what === 'receipt' ? `Receipts are read by ${company}` : `Pock answers using ${company}`}
      </Text>
      <Text style={[type.subhead, { color: c.textMuted, lineHeight: 21 }]}>
        To answer, Pockit sends your question and the figures it needs from your records (amounts, dates, categories and shop names) to {company}. Receipt photos you scan go there to be read, and aren’t kept. {company} doesn’t use any of it to train its models. Your bank login never leaves Pockit.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.xs, flexWrap: 'wrap' }}>
        <Pressable onPress={() => void allow()} disabled={busy} accessibilityRole="button"
          style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: a.accent, opacity: pressed || busy ? 0.7 : 1 })}>
          <Text style={[type.subhead, { color: '#ffffff', fontWeight: '600' }]}>{busy ? 'One moment…' : `Allow ${company}`}</Text>
        </Pressable>
        {onDeclined ? (
          <Pressable onPress={onDeclined} accessibilityRole="button" hitSlop={8}><Text style={[type.subhead, { color: c.textMuted }]}>Not now</Text></Pressable>
        ) : null}
        <Pressable onPress={() => void Linking.openURL(`${API_URL}/privacy`)} accessibilityRole="link" hitSlop={8}><Text style={[type.subhead, { color: c.textMuted }]}>Privacy</Text></Pressable>
      </View>
    </View>
  );
}

/** Whether a call must wait for the person's yes first. */
export function needsAiConsent(me: { aiProvider?: string | null; aiConsent?: boolean } | null): boolean {
  return Boolean(me?.aiProvider) && !me?.aiConsent;
}

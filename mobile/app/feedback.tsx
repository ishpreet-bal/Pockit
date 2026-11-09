import { useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button, Chip, ChipRow, FormError, StepScreen } from '@/components/form';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { font, radius, space, type, useColors } from '@/theme/tokens';

const KINDS = [
  { value: 'bug', label: 'Something’s broken' },
  { value: 'confusing', label: 'Something’s confusing' },
  { value: 'idea', label: 'An idea' },
  { value: 'praise', label: 'Something I like' },
] as const;

/** Tell us something. Goes to the people who run Pockit, read by a person. */
export default function Feedback() {
  const c = useColors();
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true); setError(null);
    try {
      if (!PREVIEW) await api('/api/feedback', { body: { kind, message: message.trim(), page: 'app', contactOk: true } });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'That couldn’t be sent. Try again.'); }
    finally { setBusy(false); }
  }

  if (sent) {
    return (
      <StepScreen title="Thank you." subtitle="A person reads every message. If you asked something, the reply goes to your account’s email." footer={<Button label="Done" onPress={() => router.back()} />} />
    );
  }

  return (
    <StepScreen
      top={<Text style={[type.body, { color: c.section.more.accent }]} onPress={() => router.back()}>Cancel</Text>}
      title="Tell us something"
      subtitle="Broken, confusing, or great: it all helps make Pockit better."
      footer={<Button label="Send" loading={busy} disabled={message.trim().length < 3} onPress={() => void send()} />}
    >
      <ChipRow>{KINDS.map((k) => <Chip key={k.value} section="more" label={k.label} selected={kind === k.value} onPress={() => setKind(k.value)} />)}</ChipRow>
      <View>
        <TextInput value={message} onChangeText={setMessage} multiline maxLength={4000} placeholder="What happened, or what would help?" placeholderTextColor={c.textSubtle}
          accessibilityLabel="Your message"
          style={[{ minHeight: 140, borderRadius: radius.control, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: space.md, fontFamily: font.regular, fontSize: 16, color: c.text, textAlignVertical: 'top' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
      </View>
      <FormError message={error} />
    </StepScreen>
  );
}

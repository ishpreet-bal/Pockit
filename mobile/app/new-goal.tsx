import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button, Chip, ChipRow, Field, FormError, toMinor } from '@/components/form';
import { formatMoney } from '@/components/ui';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';

const IDEAS = ['Emergency fund', 'Trip', 'New phone', 'Car', 'Home down payment', 'Pay off card'];
const WHEN: [string, number][] = [['6 months', 6], ['1 year', 12], ['2 years', 24], ['No date', 0]];

/** A new goal in one short sheet: what, how much, by when. What you've already saved is optional. */
export default function NewGoal() {
  const c = useColors();
  const a = c.section.goals;
  const { refresh } = useSummary();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [months, setMonths] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetMinor = toMinor(target);
  const monthly = targetMinor && months ? Math.max(0, targetMinor - (toMinor(saved) ?? 0)) / months : null;

  async function create() {
    setBusy(true); setError(null);
    try {
      const d = new Date(); d.setMonth(d.getMonth() + months);
      if (!PREVIEW) {
        await api('/api/mobile/goals', { body: { name: name.trim(), target: targetMinor! / 100, saved: (toMinor(saved) ?? 0) / 100, targetDate: months ? d.toISOString().slice(0, 10) : null } });
        await refresh();
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) { setError(e instanceof Error ? e.message : 'That could not be saved.'); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.xl, paddingBottom: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={[type.body, { color: a.accent }]}>Cancel</Text></Pressable>
        <Text style={[type.headline, { color: c.text }]}>New goal</Text>
        <View style={{ width: 52 }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, gap: space.xl }}>
        <View style={{ gap: space.md }}>
          <Field section="goals" label="What are you saving for?" value={name} onChangeText={setName} placeholder="A trip to Japan" autoFocus />
          <ChipRow>{IDEAS.map((i) => <Chip section="goals" key={i} label={i} selected={name === i} onPress={() => setName(i)} />)}</ChipRow>
        </View>
        <Field section="goals" label="How much do you need?" prefix="$" value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="4,000" />
        <View>
          <Text style={[type.footnote, { color: c.textMuted, marginBottom: 8 }]}>By when?</Text>
          <ChipRow>{WHEN.map(([label, m]) => <Chip section="goals" key={label} label={label} selected={months === m} onPress={() => setMonths(m)} />)}</ChipRow>
        </View>
        <Field section="goals" label="Already saved (optional)" prefix="$" value={saved} onChangeText={setSaved} keyboardType="decimal-pad" placeholder="0" />
        {monthly ? (
          <View style={{ backgroundColor: a.soft, borderRadius: 14, padding: 14 }}>
            <Text style={[type.subhead, { color: c.text }]}>That’s about <Text style={{ fontWeight: '700' }}>{formatMoney(Math.ceil(monthly / 100) * 100, { cents: false })} a month</Text>.</Text>
          </View>
        ) : null}
        <FormError message={error} />
        <Button label="Create goal" accent={a.accent} loading={busy} disabled={!name.trim() || !targetMinor} onPress={create} />
      </ScrollView>
    </View>
  );
}

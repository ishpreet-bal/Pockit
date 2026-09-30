import { useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Card, EmptyCard, formatMoney, Screen, useAccent } from '@/components/ui';
import { Button, Chip, ChipRow, Field, FormError, toMinor } from '@/components/form';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';

function Ring({ value, size = 150 }: { value: number; size?: number }) {
  const c = useColors();
  const a = useAccent();
  const r = size / 2 - 10, circ = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surface2} strokeWidth={12} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={a.accent} strokeWidth={12} fill="none" strokeLinecap="round" strokeDasharray={`${circ * Math.min(1, value)} ${circ}`} />
    </Svg>
  );
}

const byDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null);

/** One goal: how far along, what it needs, and the two things you do with it — add money, or change it. */
export default function Goal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, refresh } = useSummary();
  const goal = data?.goals.find((g) => g.id === id);
  return (
    <Screen section="goals" title={goal?.name ?? 'Goal'} back>
      {goal ? <Body goal={goal} refresh={refresh} /> : <EmptyCard title="Goal not found" body="It may have been deleted." />}
    </Screen>
  );
}

type G = NonNullable<ReturnType<typeof useSummary>['data']>['goals'][number];

function Body({ goal, refresh }: { goal: G; refresh: () => Promise<void> }) {
  const c = useColors();
  const a = useAccent();
  const [mode, setMode] = useState<'view' | 'add' | 'edit'>('view');
  const [amount, setAmount] = useState('');
  const [target, setTarget] = useState(String(goal.targetMinor / 100 || ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noTarget = goal.targetMinor === 0;
  const progress = noTarget ? 0 : goal.currentMinor / goal.targetMinor;
  const left = Math.max(0, goal.targetMinor - goal.currentMinor);
  const date = byDate(goal.targetDate);

  async function patch(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      if (!PREVIEW) { await api(`/api/mobile/goals/${goal.id}`, { method: 'PATCH', body }); await refresh(); }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMode('view'); setAmount('');
    } catch (e) { setError(e instanceof Error ? e.message : 'That could not be saved.'); }
    finally { setBusy(false); }
  }

  async function remove() {
    const go = async () => {
      if (!PREVIEW) { await api(`/api/mobile/goals/${goal.id}`, { method: 'DELETE' }); await refresh(); }
      router.back();
    };
    if (Platform.OS === 'web') { await go(); return; }
    Alert.alert(`Delete “${goal.name}”?`, 'The money you’ve saved isn’t touched — only the goal is removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void go() },
    ]);
  }

  return (
    <>
      <View style={{ alignItems: 'center', marginTop: space.sm }}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Ring value={progress} />
          <View style={{ position: 'absolute', alignItems: 'center' }}>
            <Text style={[type.title2, { color: c.text }]}>{noTarget ? '—' : `${Math.round(progress * 100)}%`}</Text>
            <Text style={[type.caption, { color: c.textMuted }]}>{goal.achieved ? 'reached 🎉' : 'saved'}</Text>
          </View>
        </View>
        <Text style={[type.title2, { color: c.text, marginTop: space.lg }]}>{formatMoney(goal.currentMinor, { cents: false })}</Text>
        <Text style={[type.subhead, { color: c.textMuted, marginTop: 2 }]}>
          {noTarget ? 'No target yet' : `of ${formatMoney(goal.targetMinor, { cents: false })}${date ? ` by ${date}` : ''}`}
        </Text>
      </View>

      {!noTarget && !goal.achieved ? (
        <View style={{ backgroundColor: a.soft, borderRadius: 14, padding: 14, marginTop: space.xl }}>
          <Text style={[type.subhead, { color: c.text, lineHeight: 21 }]}>
            {formatMoney(left, { cents: false })} to go
            {goal.monthlyMinor ? ` — about ${formatMoney(goal.monthlyMinor, { cents: false })} a month${date ? ' gets you there on time' : ''}.` : '. Add a date to see how much to put aside each month.'}
            {goal.status === 'behind' ? ' You’re a little behind; a bit extra this month would catch you up.' : ''}
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: space.xl, gap: space.md }}>
        {mode === 'add' ? (
          <Card style={{ padding: space.lg, gap: space.md }}>
            <ChipRow>
              {[25, 50, 100, 250].map((n) => <Chip section="goals" key={n} label={`+$${n}`} selected={amount === String(n)} onPress={() => setAmount(String(n))} />)}
            </ChipRow>
            <Field section="goals" label="Amount to add" prefix="$" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
            <FormError message={error} />
            <Button label={toMinor(amount) ? `Add ${formatMoney(toMinor(amount)!)}` : 'Add'} accent={a.accent} loading={busy} disabled={!toMinor(amount)} onPress={() => patch({ add: toMinor(amount)! / 100 })} />
            <Button label="Cancel" variant="plain" accent={a.accent} onPress={() => setMode('view')} />
          </Card>
        ) : mode === 'edit' ? (
          <Card style={{ padding: space.lg, gap: space.md }}>
            <Field section="goals" label="Target amount" prefix="$" value={target} onChangeText={setTarget} keyboardType="decimal-pad" />
            <Text style={[type.footnote, { color: c.textMuted }]}>Finish by</Text>
            <ChipRow>
              {[['6 months', 6], ['1 year', 12], ['2 years', 24], ['No date', 0]].map(([label, months]) => (
                <Chip section="goals" key={String(label)} label={String(label)} selected={false} onPress={() => {
                  const d = new Date(); d.setMonth(d.getMonth() + Number(months));
                  void patch({ target: (toMinor(target) ?? goal.targetMinor) / 100, targetDate: Number(months) ? d.toISOString().slice(0, 10) : null });
                }} />
              ))}
            </ChipRow>
            <FormError message={error} />
            <Button label="Save amount" accent={a.accent} loading={busy} disabled={!toMinor(target)} onPress={() => patch({ target: toMinor(target)! / 100 })} />
            <Button label="Cancel" variant="plain" accent={a.accent} onPress={() => setMode('view')} />
          </Card>
        ) : (
          <>
            <Button label="Add money" accent={a.accent} onPress={() => setMode('add')} />
            <Button label={noTarget ? 'Set a target' : 'Change amount or date'} variant="secondary" onPress={() => setMode('edit')} />
            <Pressable onPress={remove} style={{ alignItems: 'center', padding: space.md }} accessibilityRole="button">
              <Text style={[type.subhead, { color: c.negative }]}>Delete goal</Text>
            </Pressable>
          </>
        )}
      </View>
    </>
  );
}

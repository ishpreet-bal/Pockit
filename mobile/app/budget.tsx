import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { useTint } from '@/theme/palette';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button, FormError, toMinor } from '@/components/form';
import { Card, Loading, ProgressBar, Screen, formatMoney, useAccent } from '@/components/ui';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { font, space, type, useColors } from '@/theme/tokens';

/**
 * Budget: an amount per category for the month, with what's gone out beside it.
 *
 * Blank means "not budgeted" — nobody has to plan every category. "Use last
 * month" isn't offered yet; instead an empty plan suggests this month's spend,
 * rounded up, so there's a sensible starting point to edit.
 */

interface Line { id: string; name: string; icon: string | null; spentMinor: number; planMinor: number | null }

const DEMO: Line[] = [
  { id: '1', name: 'Groceries', icon: '🛒', spentMinor: 48_210, planMinor: 55_000 },
  { id: '2', name: 'Eating out', icon: '🍽️', spentMinor: 31_540, planMinor: 25_000 },
  { id: '3', name: 'Transport', icon: '🚗', spentMinor: 18_900, planMinor: 30_000 },
  { id: '4', name: 'Coffee', icon: '☕', spentMinor: 6_700, planMinor: 8_000 },
  { id: '5', name: 'Shopping', icon: '🛍️', spentMinor: 12_000, planMinor: null },
];

const roundUp = (minor: number) => Math.ceil(minor / 2_500) * 25; // to the next $25, in dollars

export default function Budget() {
  const c = useColors();
  const tint = useTint();
  const { refresh } = useSummary();
  const [lines, setLines] = useState<Line[] | null>(PREVIEW ? DEMO : null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (PREVIEW) return;
    api<{ categories: Line[]; hasPlan: boolean }>('/api/mobile/budget')
      .then((r) => { setLines(r.categories); if (!r.hasPlan) startEditing(r.categories, true); })
      .catch(() => setError('Couldn’t load your budget. Pull down on Spending and try again.'));
  }, []);

  function startEditing(from: Line[], suggest = false) {
    setDraft(Object.fromEntries(from.map((l) => [l.id,
      l.planMinor !== null ? String(l.planMinor / 100) : suggest && l.spentMinor > 0 ? String(roundUp(l.spentMinor)) : ''])));
    setEditing(true);
  }

  async function save() {
    if (!lines) return;
    setError(null);
    const next = lines.map((l) => ({ ...l, planMinor: toMinor(draft[l.id] ?? '') || null }));
    if (PREVIEW) { setLines(next); setEditing(false); return; }
    setSaving(true);
    try {
      await api('/api/mobile/budget', { method: 'POST', body: { lines: next.filter((l) => l.planMinor).map((l) => ({ categoryId: l.id, amount: l.planMinor! / 100 })) } });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLines(next); setEditing(false); refresh();
    } catch { setError('That didn’t save. Check your connection and try again.'); }
    finally { setSaving(false); }
  }

  if (!lines) return <Screen section="spending" title="Budget" back><Loading error={error} /></Screen>;

  const planned = lines.filter((l) => l.planMinor);
  const total = planned.reduce((s, l) => s + l.planMinor!, 0);
  const spent = planned.reduce((s, l) => s + l.spentMinor, 0);
  const draftTotal = lines.reduce((s, l) => s + (toMinor(draft[l.id] ?? '') ?? 0), 0);

  return (
    <Screen section="spending" title="Budget" back right={!editing ? <EditButton onPress={() => startEditing(lines)} /> : undefined}>
      {editing ? (
        <>
          <Text style={[type.body, { color: c.textMuted, lineHeight: 22 }]}>
            How much do you want to spend on each this month? Leave any blank to skip it.
            {lines.some((l) => l.spentMinor > 0) ? ' We’ve started you off from what you’ve spent so far.' : ''}
          </Text>
          <Card style={{ marginTop: space.lg }}>
            {lines.map((l, i) => (
              <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, borderBottomWidth: i < lines.length - 1 ? 0.5 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 18, width: 26 }}>{l.icon ?? '•'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: c.text }]}>{l.name}</Text>
                  {l.spentMinor > 0 ? <Text style={[type.footnote, { color: c.textMuted }]}>{formatMoney(l.spentMinor, { cents: false })} so far</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', width: 110, height: 42, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, backgroundColor: c.bg }}>
                  <Text style={{ fontFamily: font.medium, color: c.textMuted }}>$</Text>
                  <TextInput
                    accessibilityLabel={`${l.name} budget`}
                    value={draft[l.id] ?? ''}
                    onChangeText={(t) => setDraft({ ...draft, [l.id]: t })}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={c.textSubtle}
                    style={{ flex: 1, textAlign: 'right', fontFamily: font.medium, fontSize: 17, color: c.text }}
                  />
                </View>
              </View>
            ))}
          </Card>
          <Text style={[type.subhead, { color: c.textMuted, marginTop: space.md, textAlign: 'right' }]}>Total {formatMoney(draftTotal, { cents: false })} a month</Text>
          <FormError message={error} />
          <View style={{ gap: space.sm, marginTop: space.lg }}>
            <Button label={saving ? 'Saving…' : 'Save budget'} onPress={() => void save()} disabled={saving} />
            {planned.length ? <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} /> : <Button label="Not now" variant="secondary" onPress={() => router.back()} />}
          </View>
        </>
      ) : (
        <>
          <Text style={[type.subhead, { color: c.textMuted }]}>Left this month</Text>
          <Text style={[type.hero, { color: total - spent >= 0 ? c.text : c.negative }]}>{formatMoney(Math.abs(total - spent), { cents: false })}{total - spent < 0 ? ' over' : ''}</Text>
          <Text style={[type.footnote, { color: c.textMuted, marginTop: 4 }]}>{formatMoney(spent, { cents: false })} of {formatMoney(total, { cents: false })} spent</Text>
          <View style={{ marginTop: space.lg }}><ProgressBar value={total ? spent / total : 0} height={10} /></View>
          <Card style={{ marginTop: space.xl }}>
            {planned.map((l, i) => {
              const over = l.spentMinor > l.planMinor!;
              return (
                <View key={l.id} style={{ paddingVertical: 12, borderBottomWidth: i < planned.length - 1 ? 0.5 : 0, borderBottomColor: c.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <Text style={{ fontSize: 17 }}>{l.icon ?? '•'}</Text>
                    <Text style={[type.body, { color: c.text, flex: 1 }]}>{l.name}</Text>
                    <Text style={[type.subhead, { color: over ? c.negative : c.textMuted }]}>
                      {over ? `${formatMoney(l.spentMinor - l.planMinor!, { cents: false })} over` : `${formatMoney(l.planMinor! - l.spentMinor, { cents: false })} left`}
                    </Text>
                  </View>
                  <View style={{ marginTop: 8 }}><ProgressBar color={tint(l.name)} value={l.spentMinor / l.planMinor!} /></View>
                </View>
              );
            })}
          </Card>
          {lines.length > planned.length ? (
            <Text style={[type.footnote, { color: c.textMuted, marginTop: space.md }]}>
              {lines.length - planned.length} {lines.length - planned.length === 1 ? 'category isn’t' : 'categories aren’t'} budgeted. Tap Edit to add {lines.length - planned.length === 1 ? 'it' : 'them'}.
            </Text>
          ) : null}
          <TripCard />
        </>
      )}
    </Screen>
  );
}

function EditButton({ onPress }: { onPress: () => void }) {
  const a = useAccent();
  return <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button"><Text style={[type.bodyStrong, { color: a.accent }]}>Edit</Text></Pressable>;
}

/** Driving somewhere? Work out the gas before it lands in Transportation. */
function TripCard() {
  const c = useColors();
  const a = useAccent();
  return (
    <Card style={{ marginTop: space.xl }} onPress={() => router.push('/trip')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg }}>
        <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="car" size={22} color={a.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyStrong, { color: c.text }]}>Plan a trip</Text>
          <Text style={[type.footnote, { color: c.textMuted }]}>What a drive or your commute costs in gas</Text>
        </View>
        <Icon name="chevron.right" size={15} color={c.textSubtle} />
      </View>
    </Card>
  );
}

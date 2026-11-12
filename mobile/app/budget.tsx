import { useEffect, useState } from 'react';
import { Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { getPref, setPref } from '@/lib/prefs';
import { askForNotifications } from '@/lib/reminders';
import { Icon } from '@/components/Icon';
import { useTint } from '@/theme/palette';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button, FormError, toMinor } from '@/components/form';
import { Card, Loading, ProgressBar, Screen, SectionHeader, Segmented, formatMoney, useAccent } from '@/components/ui';
import { Projection } from '@/components/Outlook';
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

interface Line { id: string; name: string; icon: string | null; spentMinor: number; planMinor: number | null; carriedMinor?: number }
interface Settings { rollover: boolean; resetsOn: 'month' | 'payday'; payday: { name: string; period: string } | null; period: { start: string; end: string } | null }

const DEMO: Line[] = [
  { id: '1', name: 'Groceries', icon: null, spentMinor: 48_210, planMinor: 55_000, carriedMinor: 3_000 },
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
  const [settings, setSettings] = useState<Settings>(PREVIEW
    ? { rollover: true, resetsOn: 'month', payday: { name: 'Payday', period: 'biweekly' }, period: { start: '2026-10-01', end: '2026-10-31' } }
    : { rollover: false, resetsOn: 'month', payday: null, period: null });

  useEffect(() => {
    if (PREVIEW) return;
    api<{ categories: Line[]; hasPlan: boolean } & Settings>('/api/mobile/budget')
      .then((r) => { setLines(r.categories); setSettings({ rollover: r.rollover, resetsOn: r.resetsOn, payday: r.payday, period: r.period }); if (!r.hasPlan) startEditing(r.categories, true); })
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
      await api('/api/mobile/budget', { method: 'POST', body: { lines: next.filter((l) => l.planMinor).map((l) => ({ categoryId: l.id, amount: l.planMinor! / 100 })), rollover: settings.rollover, resetsOn: settings.resetsOn } });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLines(next); setEditing(false); refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save. Check your connection and try again.'); }
    finally { setSaving(false); }
  }

  if (!lines) return <Screen section="spending" title="Budget" back><Loading error={error} /></Screen>;

  const planned = lines.filter((l) => l.planMinor);
  const total = planned.reduce((s, l) => s + l.planMinor! + (l.carriedMinor ?? 0), 0);
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
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tint(l.name) }} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: c.text }]}>{l.name}</Text>
                  {l.spentMinor > 0 ? <Text style={[type.footnote, { color: c.textMuted }]}>{formatMoney(l.spentMinor, { cents: false })} so far</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', width: 124, height: 42, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, backgroundColor: c.bg }}>
                  <Text style={{ fontFamily: font.medium, color: c.textMuted }}>$</Text>
                  <TextInput
                    accessibilityLabel={`${l.name} budget`}
                    value={draft[l.id] ?? ''}
                    onChangeText={(t) => setDraft({ ...draft, [l.id]: t })}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={c.textSubtle}
                    style={[{ flex: 1, minWidth: 60, height: 40, textAlign: 'right', fontFamily: font.medium, fontSize: 17, color: c.text, padding: 0 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
                  />
                </View>
              </View>
            ))}
          </Card>
          <Text style={[type.subhead, { color: c.textMuted, marginTop: space.md, textAlign: 'right' }]}>Total {formatMoney(draftTotal, { cents: false })} {settings.resetsOn === 'payday' ? 'per pay period' : 'a month'}</Text>

          <SectionHeader title="How it works" />
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: c.border }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.text }]}>Carry leftovers over</Text>
                <Text style={[type.footnote, { color: c.textMuted, marginTop: 2, lineHeight: 18 }]}>Didn’t use it all? The rest adds to next period. Overspending never carries.</Text>
              </View>
              <Switch value={settings.rollover} onValueChange={(v) => setSettings({ ...settings, rollover: v })} trackColor={{ true: c.section.spending.accent }} accessibilityLabel="Carry leftovers over" />
            </View>
            <View style={{ paddingVertical: 12 }}>
              <Text style={[type.body, { color: c.text }]}>Starts fresh</Text>
              <View style={{ marginTop: 8 }}>
                <Segmented options={['On the 1st', 'On payday'] as const} value={settings.resetsOn === 'payday' ? 'On payday' : 'On the 1st'}
                  onChange={(v) => setSettings({ ...settings, resetsOn: v === 'On payday' ? 'payday' : 'month' })} />
              </View>
              {settings.resetsOn === 'payday' && !settings.payday ? (
                <Text style={[type.footnote, { color: c.warning, marginTop: 6 }]}>Add your pay under Bills first, so Pockit knows when payday is.</Text>
              ) : settings.resetsOn === 'payday' ? (
                <Text style={[type.footnote, { color: c.textMuted, marginTop: 6 }]}>Follows your {settings.payday!.period} pay — every budget restarts the day money comes in.</Text>
              ) : null}
            </View>
          </Card>
          <FormError message={error} />
          <View style={{ gap: space.sm, marginTop: space.lg }}>
            <Button label={saving ? 'Saving…' : 'Save budget'} onPress={() => void save()} disabled={saving} />
            {planned.length ? <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} /> : <Button label="Not now" variant="secondary" onPress={() => router.back()} />}
          </View>
        </>
      ) : (
        <>
          <Text style={[type.subhead, { color: c.textMuted }]}>{settings.resetsOn === 'payday' ? 'Left until payday' : 'Left this month'}</Text>
          <Text style={[type.hero, { color: total - spent >= 0 ? c.text : c.negative }]}>{formatMoney(Math.abs(total - spent), { cents: false })}{total - spent < 0 ? ' over' : ''}</Text>
          <Text style={[type.footnote, { color: c.textMuted, marginTop: 4 }]}>{formatMoney(spent, { cents: false })} of {formatMoney(total, { cents: false })} spent</Text>
          <View style={{ marginTop: space.lg }}><ProgressBar value={total ? spent / total : 0} height={10} /></View>
          <Projection />
          <Card style={{ marginTop: space.xl }}>
            {planned.map((l, i) => {
              const cap = l.planMinor! + (l.carriedMinor ?? 0);
              const over = l.spentMinor > cap;
              return (
                <View key={l.id} style={{ paddingVertical: 12, borderBottomWidth: i < planned.length - 1 ? 0.5 : 0, borderBottomColor: c.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tint(l.name) }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { color: c.text }]}>{l.name}</Text>
                      {l.carriedMinor ? <Text style={[type.footnote, { color: c.positive }]}>+{formatMoney(l.carriedMinor, { cents: false })} carried over</Text> : null}
                    </View>
                    <Text style={[type.subhead, { color: over ? c.negative : c.textMuted }]}>
                      {over ? `${formatMoney(l.spentMinor - cap, { cents: false })} over` : `${formatMoney(cap - l.spentMinor, { cents: false })} left`}
                    </Text>
                  </View>
                  <View style={{ marginTop: 8 }}><ProgressBar color={tint(l.name)} value={l.spentMinor / cap} /></View>
                </View>
              );
            })}
          </Card>
          {lines.length > planned.length ? (
            <Text style={[type.footnote, { color: c.textMuted, marginTop: space.md }]}>
              {lines.length - planned.length} {lines.length - planned.length === 1 ? 'category isn’t' : 'categories aren’t'} budgeted. Tap Edit to add {lines.length - planned.length === 1 ? 'it' : 'them'}.
            </Text>
          ) : null}
          <AlertNudge />
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

/** Budgets work best with a heads-up before it's too late — offer it once, right here. */
function AlertNudge() {
  const c = useColors();
  const a = useAccent();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => { void getPref('budgetAlerts').then(setOn); }, []);
  if (on !== false || Platform.OS === 'web') return null;
  return (
    <Pressable accessibilityRole="button" onPress={async () => { if (await askForNotifications()) { await setPref('budgetAlerts', true); setOn(true); } }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.xl, opacity: pressed ? 0.6 : 1 })}>
      <Icon name="calendar.badge.clock" size={18} color={a.accent} />
      <Text style={[type.subhead, { color: a.accent, flex: 1 }]}>Alert me when a category hits 80%</Text>
    </Pressable>
  );
}

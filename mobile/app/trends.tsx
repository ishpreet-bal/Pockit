import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Card, Loading, Screen, SectionHeader, formatMoney } from '@/components/ui';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { soft, useTint } from '@/theme/palette';
import { space, type, useColors, useIsDark } from '@/theme/tokens';

/**
 * Trends: six months of spending as colourful stacked bars, then category by
 * category. Tap a category to see just its months.
 */
interface Trends { months: string[]; totals: number[]; categories: { id: string; name: string; months: number[] }[]; notes: { kind: 'up' | 'down'; category: string; text: string }[] }

const DEMO: Trends = {
  months: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
  totals: [148_000, 162_000, 139_000, 171_000, 155_000, 105_300],
  categories: [
    { id: '1', name: 'Groceries', months: [52_000, 55_000, 49_000, 58_000, 54_000, 48_210] },
    { id: '2', name: 'Eating out', months: [24_000, 31_000, 22_000, 35_000, 26_000, 31_540] },
    { id: '3', name: 'Transport', months: [28_000, 27_000, 26_000, 30_000, 29_000, 18_900] },
    { id: '4', name: 'Shopping', months: [30_000, 35_000, 28_000, 33_000, 31_000, 0] },
    { id: '5', name: 'Coffee', months: [14_000, 14_000, 14_000, 15_000, 15_000, 6_700] },
  ],
  notes: [{ kind: 'up', category: 'Eating out', text: 'Eating out is on track to be about $90 more than your usual month.' }, { kind: 'down', category: 'Transport', text: 'Transport is about $60 under your usual — nice.' }],
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function TrendsScreen() {
  const c = useColors();
  const dark = useIsDark();
  const tint = useTint();
  const [t, setT] = useState<Trends | null>(PREVIEW ? DEMO : null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    if (PREVIEW) return;
    api<Trends>('/api/mobile/trends').then(setT).catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load trends.'));
  }, []);

  if (!t) return <Screen section="spending" title="Trends" back><Loading error={error} /></Screen>;
  const shown = focus ? t.categories.filter((x) => x.id === focus) : t.categories;
  const monthTotals = t.months.map((_, i) => shown.reduce((s, x) => s + x.months[i]!, 0));
  const max = Math.max(1, ...monthTotals);
  const avg = monthTotals.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, monthTotals.length - 1);

  return (
    <Screen section="spending" title="Trends" back>
      <Text style={[type.subhead, { color: c.textMuted }]}>{focus ? shown[0]?.name : 'All spending'} · usual month</Text>
      <Text style={[type.hero, { color: c.text }]}>{formatMoney(avg, { cents: false })}</Text>

      {/* Six months, stacked by category. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 170, marginTop: space.xl }}>
        {t.months.map((m, i) => (
          <View key={m} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ width: '100%', height: 140, justifyContent: 'flex-end' }}>
              <Animated.View entering={FadeIn.delay(i * 60).duration(300)} style={{ borderRadius: 8, overflow: 'hidden', height: `${(monthTotals[i]! / max) * 100}%` }}>
                {shown.map((x) => x.months[i]! > 0 ? <View key={x.id} style={{ flex: x.months[i]!, backgroundColor: tint(x.name), opacity: i === t.months.length - 1 ? 1 : 0.85 }} /> : null)}
              </Animated.View>
            </View>
            <Text style={[type.caption, { color: i === t.months.length - 1 ? c.text : c.textMuted, letterSpacing: 0 }]}>{MON[Number(m.slice(5)) - 1]}</Text>
          </View>
        ))}
      </View>

      {t.notes.length ? (
        <View style={{ gap: 8, marginTop: space.xl }}>
          {t.notes.map((n) => (
            <View key={n.text} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: soft(n.kind === 'up' ? c.negative : '#6fdc9a', dark) }}>
              <Text style={{ fontSize: 15, color: n.kind === 'up' ? c.negative : '#2fa866' }}>{n.kind === 'up' ? '▲' : '▼'}</Text>
              <Text style={[type.footnote, { color: c.text, flex: 1, lineHeight: 19 }]}>{n.text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <SectionHeader title="By category" action={focus ? 'Show all' : undefined} onAction={() => setFocus(null)} />
      <Card>
        {t.categories.map((x, i) => {
          const now = x.months[x.months.length - 1]!;
          const usual = x.months.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, x.months.length - 1);
          return (
            <Pressable key={x.id} onPress={() => setFocus(focus === x.id ? null : x.id)} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: i < t.categories.length - 1 ? 0.5 : 0, borderBottomColor: c.border, opacity: pressed ? 0.6 : focus && focus !== x.id ? 0.45 : 1 })}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: tint(x.name) }} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.text }]}>{x.name}</Text>
                <Text style={[type.footnote, { color: c.textMuted }]}>usually {formatMoney(usual, { cents: false })}</Text>
              </View>
              <Text style={[type.bodyStrong, { color: c.text }]}>{formatMoney(now, { cents: false })}</Text>
            </Pressable>
          );
        })}
      </Card>
      <Text style={[type.footnote, { color: c.textSubtle, marginTop: space.md }]}>This month so far. Tap a category to see only its months.</Text>
    </Screen>
  );
}

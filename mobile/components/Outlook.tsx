import { useCallback, useEffect, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { Card, formatMoney, SectionHeader, useAccent } from '@/components/ui';
import { Chip, ChipRow } from '@/components/form';
import { LineChart } from '@/components/LineChart';
import { space, type, useColors } from '@/theme/tokens';

/**
 * Where your money is headed (the projection) and the everyday habits behind it.
 * Server: /api/mobile/outlook. The projection is a sum shown in parts, so a
 * surprising number can be checked: start + pay − bills − everyday spending.
 */

interface Outlook {
  today: string; until: string;
  presets: { label: string; date: string }[];
  projection: {
    startMinor: number; incomeMinor: number; billsMinor: number; everydayMinor: number; perDayMinor: number; projectedMinor: number;
    paydays: number; lowest: { date: string; minor: number }; points: { date: string; minor: number }[];
  };
  habits: { name: string; rhythm: string; perWeekMinor: number; typicalMinor: number; visits: number; category: string | null }[];
  perWeek: { category: string; perWeekMinor: number }[];
  windowDays: number;
}

const SAMPLE: Outlook = {
  today: '2026-11-12', until: '2026-11-30',
  presets: [{ label: 'End of month', date: '2026-11-30' }, { label: 'Next payday', date: '2026-11-20' }, { label: 'In 3 months', date: '2027-02-12' }],
  projection: { startMinor: 179600, incomeMinor: 231500, billsMinor: 26600, everydayMinor: 61200, perDayMinor: 3400, projectedMinor: 323300, paydays: 1, lowest: { date: '2026-11-19', minor: 128000 }, points: [{ date: '2026-11-12', minor: 179600 }, { date: '2026-11-19', minor: 128000 }, { date: '2026-11-26', minor: 330000 }, { date: '2026-11-30', minor: 323300 }] },
  habits: [
    { name: 'Circle K', rhythm: 'about once a week', perWeekMinor: 5400, typicalMinor: 5200, visits: 8, category: 'Gas' },
    { name: 'Magna Electronics Cafeteria', rhythm: 'every weekday', perWeekMinor: 3250, typicalMinor: 650, visits: 38, category: 'Restaurants' },
    { name: 'Tim Hortons', rhythm: 'a few times a week', perWeekMinor: 1500, typicalMinor: 520, visits: 22, category: 'Coffee' },
  ],
  perWeek: [{ category: 'Gas', perWeekMinor: 5400 }, { category: 'Restaurants', perWeekMinor: 4800 }],
  windowDays: 56,
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (iso: string) => `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

function useOutlook(until: string | null) {
  const [data, setData] = useState<Outlook | null>(PREVIEW ? SAMPLE : null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (PREVIEW) return;
    try { setData(await api<Outlook>(`/api/mobile/outlook${until ? `?until=${until}` : ''}`)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t work this out right now.'); }
  }, [until]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { void load(); }, [load]);
  return { data, error };
}

/** "If you keep this up": where the everyday account is headed by a date you pick. */
export function Projection() {
  const c = useColors();
  const a = useAccent();
  const { width } = useWindowDimensions();
  const [until, setUntil] = useState<string | null>(null);
  const { data, error } = useOutlook(until);
  if (!data) return error ? <Text style={[type.footnote, { color: c.textMuted, marginTop: space.lg }]}>{error}</Text> : null;
  const p = data.projection;
  const good = p.projectedMinor >= 0;
  const chartWidth = Math.min(width, 520) - space.lg * 2 - 32;
  return (
    <Animated.View entering={FadeIn.duration(260)}>
      <SectionHeader title="If you keep this up" />
      <ChipRow>
        {data.presets.map((pr) => <Chip key={pr.date} section="spending" label={pr.label} selected={data.until === pr.date} onPress={() => setUntil(pr.date)} />)}
      </ChipRow>
      <Card style={{ marginTop: space.md, paddingVertical: space.lg, gap: 4 }}>
        <Text style={[type.subhead, { color: c.textMuted }]}>By {short(data.until)} you’d have</Text>
        <Text style={[type.title2, { color: good ? a.accent : c.negative, fontVariant: ['tabular-nums'] }]}>{good ? '' : '−'}{formatMoney(Math.abs(p.projectedMinor), { cents: false })}</Text>
        {p.points.length > 2 ? (
          <View style={{ marginTop: space.sm }}>
            <LineChart values={p.points.map((x) => x.minor / 100)} labels={p.points.map((x) => short(x.date))} width={chartWidth} height={96} format={(v) => formatMoney(v * 100, { cents: false })} />
          </View>
        ) : null}
        <View style={{ marginTop: space.md, gap: 6 }}>
          <Line label="In your everyday account now (after cards)" value={p.startMinor} />
          <Line label={p.paydays ? `Pay coming in (${p.paydays}×)` : 'Pay coming in'} value={p.incomeMinor} sign="+" />
          <Line label="Bills on their dates" value={p.billsMinor} sign="−" />
          <Line label={`Everyday spending at ${formatMoney(p.perDayMinor, { cents: false })}/day`} value={p.everydayMinor} sign="−" />
        </View>
        {p.lowest.minor < p.startMinor && p.lowest.date !== data.today ? (
          <Text style={[type.footnote, { color: p.lowest.minor < 0 ? c.negative : c.textMuted, marginTop: space.md, lineHeight: 20 }]}>
            Lowest point: {formatMoney(p.lowest.minor, { cents: false })} around {short(p.lowest.date)}{p.lowest.minor < 0 ? ', before pay comes in.' : '.'}
          </Text>
        ) : null}
        {!p.paydays ? <Text style={[type.footnote, { color: c.textMuted, marginTop: space.sm, lineHeight: 20 }]}>No pay found yet. Add it under Bills & income and it’s counted here.</Text> : null}
      </Card>
    </Animated.View>
  );
}

function Line({ label, value, sign }: { label: string; value: number; sign?: '+' | '−' }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
      <Text style={[type.footnote, { color: c.textMuted, flex: 1 }]}>{label}</Text>
      <Text style={[type.footnote, { color: c.text, fontVariant: ['tabular-nums'] }]}>{sign ?? ''}{formatMoney(value, { cents: false })}</Text>
    </View>
  );
}

/** Everyday spending that isn't a bill but happens all the time, with what it costs a week. */
export function Habits() {
  const c = useColors();
  const { data } = useOutlook(null);
  if (!data?.habits.length) return null;
  return (
    <Animated.View entering={FadeIn.duration(260)}>
      <SectionHeader title="Your habits" />
      <Card>
        {data.habits.map((h, i) => (
          <View key={h.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: i === data.habits.length - 1 ? 0 : 0.5, borderBottomColor: c.border }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { color: c.text }]} numberOfLines={1}>{h.name}</Text>
              <Text style={[type.footnote, { color: c.textMuted }]} numberOfLines={1}>{h.rhythm} · usually {formatMoney(h.typicalMinor)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[type.bodyStrong, { color: c.text, fontVariant: ['tabular-nums'] }]}>{formatMoney(h.perWeekMinor, { cents: false })}</Text>
              <Text style={[type.caption, { color: c.textMuted }]}>a week</Text>
            </View>
          </View>
        ))}
      </Card>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: space.sm, lineHeight: 20 }]}>
        From the last {Math.round(data.windowDays / 7)} weeks. {data.perWeek[0] ? `Your biggest weekly spend is ${data.perWeek[0].category.toLowerCase()}: ${formatMoney(data.perWeek[0].perWeekMinor, { cents: false })} a week.` : ''}
      </Text>
    </Animated.View>
  );
}

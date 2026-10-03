import { Text, View } from 'react-native';
import { Card, EmptyCard, Loading, formatMoney, friendlyDate, PreviewBadge, Row, Screen, SectionHeader, StaleNote, useAccent } from '@/components/ui';
import { PREVIEW } from '@/lib/session';
import { useSummary, type Summary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';
import { router } from 'expo-router';
import { AddButton } from '../transactions';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Spending: how much this month, against the plan, by category, and the latest few. */
export default function Spending() {
  const { data, error, refreshing, refresh } = useSummary();
  return (
    <Screen section="spending" title={data ? MONTHS[Number(data.today.slice(5, 7)) - 1]! : 'Spending'} onRefresh={refresh} refreshing={refreshing} right={<AddButton />}>
      {PREVIEW ? <PreviewBadge /> : null}
      <StaleNote message={data ? error : null} />
      {data ? <Body d={data} /> : <Loading error={error} />}
    </Screen>
  );
}

function Body({ d }: { d: Summary }) {
  const c = useColors();
  const a = useAccent();
  const s = d.spending;
  const left = s.budgetMinor !== null ? s.budgetMinor - s.spentMinor : null;
  const end = s.periodEnd ?? d.today;
  const daysLeft = Math.max(0, Math.round((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${d.today}T12:00:00Z`).getTime()) / 86_400_000));

  return (
    <>
      <Text style={[type.hero, { color: c.text }]}>{formatMoney(s.spentMinor, { cents: false })}</Text>
      <Text style={[type.subhead, { color: c.textMuted, marginTop: 4 }]}>
        spent
        {left !== null ? <Text style={{ color: left >= 0 ? a.accent : c.negative }}>{` · ${formatMoney(Math.abs(left), { cents: false })} ${left >= 0 ? 'left' : 'over'}`}</Text> : null}
        {` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} to go`}
      </Text>
      {s.spentDeltaMinor !== null ? (
        <Text style={[type.footnote, { color: c.textSubtle, marginTop: 2 }]}>{formatMoney(Math.abs(s.spentDeltaMinor), { cents: false })} {s.spentDeltaMinor <= 0 ? 'less' : 'more'} than last month</Text>
      ) : null}

      <MonthGrid d={d} />

      <SectionHeader title="By category" action={s.budgetMinor ? 'Plan' : 'Make a plan'} onAction={() => router.push('/budget')} />
      {s.categories.length ? (
        <Card>
          {s.categories.map((cat, i) => {
            const over = cat.budgetMinor !== null && cat.amountMinor > cat.budgetMinor;
            return (
              <View key={cat.id} style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 14, borderBottomWidth: i < s.categories.length - 1 ? 0.5 : 0, borderBottomColor: c.border }}>
                <Text style={[type.body, { color: c.text, flex: 1 }]} numberOfLines={1}>{cat.name}</Text>
                <Text style={[type.body, { color: over ? c.negative : c.text, fontVariant: ['tabular-nums'] }]}>{formatMoney(cat.amountMinor, { cents: false }).replace('$', '')}</Text>
                <Text style={[type.body, { color: c.textMuted, width: 64, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>
                  {cat.budgetMinor ? `/${Math.round(cat.budgetMinor / 100)}` : `${Math.round((cat.amountMinor / Math.max(1, s.spentMinor)) * 100)}%`}
                </Text>
              </View>
            );
          })}
        </Card>
      ) : (
        <EmptyCard title="Nothing spent yet this month" body="Tap + to add a purchase, or import a bank statement, and it’ll be sorted into categories here." />
      )}

      {/* Always reachable — at the start of a month there's nothing recent yet, but last month's list matters. */}
      <SectionHeader title="Lately" action="See all" onAction={() => router.push('/transactions')} />
      {s.recent.length ? (
        <Card>
          {s.recent.map((t, i) => (
            <Row key={t.id} icon="cart" title={t.name} detail={`${friendlyDate(t.date, d.today)}${t.category ? ` · ${t.category}` : ''}`} value={formatMoney(t.amountMinor, { signed: true })} valueColor={t.amountMinor > 0 ? c.positive : undefined} last={i === s.recent.length - 1} />
          ))}
        </Card>
      ) : (
        <EmptyCard title="Nothing yet this month" body="Tap See all to look back at last month, or + to add a purchase." />
      )}
    </>
  );
}

/** The month as a grid of days: the brighter the square, the more went out that day. */
function MonthGrid({ d }: { d: Summary }) {
  const c = useColors();
  const a = useAccent();
  const start = d.spending.periodStart ?? `${d.today.slice(0, 8)}01`;
  const end = d.spending.periodEnd ?? d.today;
  const byDay = new Map((d.spending.daily ?? []).map((x) => [x.date, x.amountMinor]));
  const max = Math.max(1, ...byDay.values());
  const days: string[] = [];
  for (let t = new Date(`${start}T12:00:00Z`); t <= new Date(`${end}T12:00:00Z`) && days.length < 42; t = new Date(t.getTime() + 86_400_000)) days.push(t.toISOString().slice(0, 10));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.xl, marginHorizontal: -3 }} accessibilityLabel="Spending by day this month">
      {days.map((day) => {
        const amt = byDay.get(day) ?? 0;
        const future = day > d.today;
        const level = amt ? 0.25 + 0.75 * (amt / max) : 0;
        return (
          <View key={day} style={{ width: `${100 / 7}%`, padding: 3 }}>
            <View style={{ aspectRatio: 1, borderRadius: 6, padding: 5, backgroundColor: future ? 'transparent' : c.surface2, borderWidth: future ? 0.5 : 0, borderColor: c.border, overflow: 'hidden' }}>
              {level ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: a.accent, opacity: level }} /> : null}
              <Text style={[type.caption, { fontSize: 10, letterSpacing: 0, color: level > 0.6 ? '#fff' : day === d.today ? c.text : c.textMuted }]}>{Number(day.slice(8))}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

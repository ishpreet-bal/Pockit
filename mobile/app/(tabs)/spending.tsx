import { Text, View } from 'react-native';
import { Card, EmptyCard, Loading, formatMoney, friendlyDate, PreviewBadge, ProgressBar, Row, Screen, SectionHeader, StaleNote, useAccent } from '@/components/ui';
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
    <Screen section="spending" title="Spending" onRefresh={refresh} refreshing={refreshing} right={<AddButton />}>
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
  const month = MONTHS[Number(d.today.slice(5, 7)) - 1];
  const left = s.budgetMinor !== null ? s.budgetMinor - s.spentMinor : null;

  return (
    <>
      <Text style={[type.subhead, { color: c.textMuted }]}>Spent in {month}</Text>
      <Text style={[type.hero, { color: c.text, marginTop: 2 }]}>{formatMoney(s.spentMinor, { cents: false })}</Text>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: 4 }]}>
        {left !== null ? (
          <>
            <Text style={{ color: left >= 0 ? c.positive : c.negative }}>{formatMoney(Math.abs(left), { cents: false })} {left >= 0 ? 'left' : 'over'}</Text> of your {formatMoney(s.budgetMinor!, { cents: false })} plan
          </>
        ) : s.spentDeltaMinor !== null ? (
          `${formatMoney(Math.abs(s.spentDeltaMinor), { cents: false })} ${s.spentDeltaMinor <= 0 ? 'less' : 'more'} than last month`
        ) : 'Set a monthly plan in Budget to see how much is left.'}
      </Text>
      {s.budgetMinor ? <View style={{ marginTop: space.lg }}><ProgressBar value={s.spentMinor / s.budgetMinor} height={10} /></View> : null}

      <SectionHeader title="Where it went" action="Budget" onAction={() => router.push('/budget')} />
      {s.categories.length ? (
        <Card>
          {s.categories.map((cat, i) => {
            const over = cat.budgetMinor !== null && cat.amountMinor > cat.budgetMinor;
            return (
              <View key={cat.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12, borderBottomWidth: i < s.categories.length - 1 ? 0.5 : 0, borderBottomColor: c.border }}>
                <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 17 }}>{cat.icon ?? '•'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[type.body, { color: c.text }]}>{cat.name}</Text>
                    <Text style={[type.bodyStrong, { color: over ? c.negative : c.text }]}>{formatMoney(cat.amountMinor, { cents: false })}</Text>
                  </View>
                  {/* With a budget: how much of it is used. Without: its share of this month's spending. */}
                  <View style={{ marginTop: 8 }}><ProgressBar value={cat.budgetMinor ? cat.amountMinor / cat.budgetMinor : cat.amountMinor / Math.max(1, s.spentMinor)} height={4} /></View>
                </View>
              </View>
            );
          })}
        </Card>
      ) : (
        <EmptyCard title="Nothing spent yet this month" body="Tap + to add a purchase, or import a bank statement, and it’ll be sorted into categories here." />
      )}

      {/* Always reachable — at the start of a month there's nothing recent yet, but last month's list matters. */}
      <SectionHeader title="Recent" action="See all" onAction={() => router.push('/transactions')} />
      {s.recent.length ? (
        <Card>
          {s.recent.map((t, i) => (
            <Row key={t.id} icon="cart" emoji={t.icon} title={t.name} detail={friendlyDate(t.date, d.today)} value={formatMoney(t.amountMinor, { signed: true })} valueColor={t.amountMinor > 0 ? c.positive : undefined} last={i === s.recent.length - 1} />
          ))}
        </Card>
      ) : (
        <EmptyCard title="Nothing yet this month" body="Tap See all to look back at last month, or + to add a purchase." />
      )}
    </>
  );
}

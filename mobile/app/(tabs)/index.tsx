import { Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Card, formatMoney, PreviewBadge, Row, Screen, SectionHeader, Segmented, useAccent, useSegment } from '@/components/ui';
import { LineChart } from '@/components/LineChart';
import { PockButton, PockMark } from '@/components/Pock';
import { preview as p } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

const RANGES = ['1W', '1M', '3M', '1Y', 'All'] as const;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  return (
    <Screen section="home" eyebrow={greeting()} title={p.name} right={<PockButton />}>
      <HomeBody />
    </Screen>
  );
}

function HomeBody() {
  const c = useColors();
  const a = useAccent();
  const { width } = useWindowDimensions();
  const [range, setRange] = useSegment<(typeof RANGES)[number]>('1M');
  const goal = p.goals[0];

  return (
    <>
      <PreviewBadge />
      <Text style={[type.subhead, { color: c.textMuted }]}>Safe to spend</Text>
      <Text style={[type.hero, { color: c.text, marginTop: 2 }]}>{formatMoney(p.safeToSpendMinor)}</Text>
      <Text style={[type.footnote, { color: c.positive, marginTop: 4 }]}>
        ▲ {formatMoney(p.changeVsLastMonthMinor, { cents: false })} more than this time last month
      </Text>

      <View style={{ marginHorizontal: -space.xl, marginTop: space.lg }}>
        <LineChart
          values={[...p.balanceSeries.values]}
          labels={[...p.balanceSeries.labels]}
          width={width}
          format={(v) => formatMoney(v, { cents: false })}
        />
      </View>
      <View style={{ marginTop: space.sm }}>
        <Segmented options={RANGES} value={range} onChange={setRange} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: a.soft, borderRadius: 14, padding: 12, marginTop: space.lg }}>
        <PockMark color={a.accent} size={22} />
        <Text style={[type.footnote, { color: c.text, flex: 1, lineHeight: 18 }]}>
          Rent is covered. You could move $50 to your emergency fund and still be fine.
        </Text>
      </View>

      <SectionHeader title="Coming up" action="See all" />
      <Card>
        {p.upcoming.map((b, i) => (
          <Row key={b.id} icon={b.icon} title={b.name} detail={b.date} value={formatMoney(b.amountMinor)} last={i === p.upcoming.length - 1} />
        ))}
      </Card>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: space.sm, marginLeft: 4 }]}>
        Next money in: {p.nextIncome.name}, {formatMoney(p.nextIncome.amountMinor, { cents: false })} on {p.nextIncome.date}
      </Text>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: space.xl }}>
        <Card style={{ flex: 1, padding: space.lg }} onPress={() => router.push('/goals')}>
          <Text style={[type.caption, { color: c.section.goals.accent }]}>GOALS</Text>
          <Text style={[type.headline, { color: c.text, marginTop: 4 }]} numberOfLines={1}>{goal.name}</Text>
          <View style={{ marginTop: 10 }}>
            <View style={{ height: 6, borderRadius: 6, backgroundColor: c.surface2 }}>
              <View style={{ width: `${(goal.currentMinor / goal.targetMinor) * 100}%`, height: 6, borderRadius: 6, backgroundColor: c.section.goals.accent }} />
            </View>
          </View>
          <Text style={[type.footnote, { color: c.textMuted, marginTop: 8 }]}>
            {Math.round((goal.currentMinor / goal.targetMinor) * 100)}% there
          </Text>
        </Card>
        <Card style={{ flex: 1, padding: space.lg }} onPress={() => router.push('/invest')}>
          <Text style={[type.caption, { color: c.section.invest.accent }]}>INVEST</Text>
          <Text style={[type.headline, { color: c.text, marginTop: 4 }]}>{formatMoney(p.invest.totalMinor, { cents: false })}</Text>
          <Text style={[type.footnote, { color: c.positive, marginTop: 8 }]}>▲ {p.invest.changePct}% this month</Text>
        </Card>
      </View>
    </>
  );
}


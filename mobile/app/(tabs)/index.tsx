import { Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Card, formatMoney, PreviewBadge, Row, Screen, SectionHeader, useAccent } from '@/components/ui';
import { LineChart } from '@/components/LineChart';
import { PockButton, PockMark } from '@/components/Pock';
import { preview as p } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

/** Home: how much can I spend, what's coming up, and a glance at goals and investments. */
export default function Home() {
  return (
    <Screen section="home" title={`Hi ${p.name}`} right={<PockButton />}>
      <Body />
    </Screen>
  );
}

function Body() {
  const c = useColors();
  const a = useAccent();
  const { width } = useWindowDimensions();
  const goal = p.goals[0];
  return (
    <>
      <PreviewBadge />
      <Text style={[type.subhead, { color: c.textMuted }]}>You can spend</Text>
      <Text style={[type.hero, { color: c.text, marginTop: 2 }]}>{formatMoney(p.safeToSpendMinor, { cents: false })}</Text>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: 4 }]}>until payday on {p.nextIncome.date} · after bills</Text>

      <View style={{ marginHorizontal: -space.xl, marginTop: space.lg }}>
        <LineChart values={[...p.balanceSeries.values]} labels={[...p.balanceSeries.labels]} width={width} height={90} format={(v) => formatMoney(v, { cents: false })} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: a.soft, borderRadius: 14, padding: 12, marginTop: space.lg }}>
        <PockMark color={a.accent} size={22} />
        <Text style={[type.footnote, { color: c.text, flex: 1, lineHeight: 18 }]}>Rent is covered. You could put $50 toward your emergency fund.</Text>
      </View>

      <SectionHeader title="Coming up" action="All bills" />
      <Card>
        {p.upcoming.map((b, i) => (
          <Row key={b.id} icon={b.icon} title={b.name} detail={b.date} value={formatMoney(b.amountMinor, { cents: false })} last={i === p.upcoming.length - 1} />
        ))}
      </Card>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: space.xl }}>
        <Card style={{ flex: 1, padding: space.lg }} onPress={() => router.push('/goals')}>
          <Text style={[type.caption, { color: c.section.goals.accent }]}>GOAL</Text>
          <Text style={[type.bodyStrong, { color: c.text, marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>{goal.name}</Text>
          <View style={{ height: 6, borderRadius: 6, backgroundColor: c.surface2, marginTop: 10 }}>
            <View style={{ width: `${(goal.currentMinor / goal.targetMinor) * 100}%`, height: 6, borderRadius: 6, backgroundColor: c.section.goals.accent }} />
          </View>
          <Text style={[type.footnote, { color: c.textMuted, marginTop: 8 }]}>{Math.round((goal.currentMinor / goal.targetMinor) * 100)}% saved</Text>
        </Card>
        <Card style={{ flex: 1, padding: space.lg }} onPress={() => router.push('/invest')}>
          <Text style={[type.caption, { color: c.section.invest.accent }]}>INVESTED</Text>
          <Text style={[type.bodyStrong, { color: c.text, marginTop: 4 }]}>{formatMoney(p.invest.totalMinor, { cents: false })}</Text>
          <Text style={[type.footnote, { color: c.positive, marginTop: 24 }]}>▲ {p.invest.changePct}% this month</Text>
        </Card>
      </View>
    </>
  );
}


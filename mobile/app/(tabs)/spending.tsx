import { Text, View } from 'react-native';
import { Card, formatMoney, PreviewBadge, ProgressBar, Row, Screen, SectionHeader } from '@/components/ui';
import { preview as p } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

/** Spending answers: how much have I spent this month, and on what? */
export default function Spending() {
  return (
    <Screen section="spending" title="Spending">
      <Body />
    </Screen>
  );
}

function Body() {
  const c = useColors();
  const s = p.spending;
  const left = s.budgetMinor - s.spentMinor;
  return (
    <>
      <PreviewBadge />
      <View style={{ alignItems: 'center', paddingVertical: space.xxl }}>
        <Text style={[type.subhead, { color: c.textMuted }]}>Spent this month</Text>
        <Text style={[type.hero, { color: c.text, fontSize: 56, marginTop: 4 }]}>{formatMoney(s.spentMinor, { cents: false })}</Text>
        <Text style={[type.subhead, { color: c.textMuted, marginTop: 6 }]}>{formatMoney(left, { cents: false })} left of your {formatMoney(s.budgetMinor, { cents: false })} plan</Text>
      </View>
      <ProgressBar value={s.spentMinor / s.budgetMinor} height={10} />

      <SectionHeader title="Where it went" action="See all" />
      <Card>
        {s.categories.slice(0, 3).map((cat, i) => (
          <Row key={cat.name} icon={cat.icon} title={cat.name} value={formatMoney(cat.spentMinor, { cents: false })} last={i === 2} />
        ))}
      </Card>
    </>
  );
}

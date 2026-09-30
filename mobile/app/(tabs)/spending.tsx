import { Text, View } from 'react-native';
import { Card, formatMoney, PreviewBadge, ProgressBar, Row, Screen, SectionHeader, useAccent } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { preview as p } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

/** Spending: how much this month, against the plan, by category, and the latest few. */
export default function Spending() {
  return (
    <Screen section="spending" title="Spending">
      <Body />
    </Screen>
  );
}

function Body() {
  const c = useColors();
  const a = useAccent();
  const s = p.spending;
  const left = s.budgetMinor - s.spentMinor;
  return (
    <>
      <PreviewBadge />
      <Text style={[type.subhead, { color: c.textMuted }]}>Spent in September</Text>
      <Text style={[type.hero, { color: c.text, marginTop: 2 }]}>{formatMoney(s.spentMinor, { cents: false })}</Text>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: 4 }]}>
        <Text style={{ color: c.positive }}>{formatMoney(left, { cents: false })} left</Text> of your {formatMoney(s.budgetMinor, { cents: false })} plan
      </Text>
      <View style={{ marginTop: space.lg }}><ProgressBar value={s.spentMinor / s.budgetMinor} height={10} /></View>

      <SectionHeader title="Where it went" action="Budget" />
      <Card>
        {s.categories.map((cat, i) => {
          const over = cat.spentMinor > cat.budgetMinor;
          return (
            <View key={cat.name} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12, borderBottomWidth: i < s.categories.length - 1 ? 0.5 : 0, borderBottomColor: c.border }}>
              <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={cat.icon} size={17} color={a.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[type.body, { color: c.text }]}>{cat.name}</Text>
                  <Text style={[type.bodyStrong, { color: over ? c.negative : c.text }]}>{formatMoney(cat.spentMinor, { cents: false })}</Text>
                </View>
                <View style={{ marginTop: 8 }}><ProgressBar value={cat.spentMinor / cat.budgetMinor} height={4} /></View>
              </View>
            </View>
          );
        })}
      </Card>

      <SectionHeader title="Recent" action="See all" />
      <Card>
        {s.recent.slice(0, 3).map((t, i) => (
          <Row key={t.id} icon={t.icon} title={t.name} detail={t.date} value={formatMoney(t.amountMinor, { signed: true })} valueColor={t.amountMinor > 0 ? c.positive : undefined} last={i === 2} />
        ))}
      </Card>
    </>
  );
}

import { Text, View } from 'react-native';
import { Card, formatMoney, PreviewBadge, Screen, SectionHeader, useAccent } from '@/components/ui';
import { preview as p } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

/** Invest: what your investments are worth, and what you own. Research lives behind search. */
export default function Invest() {
  return (
    <Screen section="invest" title="Invest">
      <Body />
    </Screen>
  );
}

function Body() {
  const c = useColors();
  const a = useAccent();
  const inv = p.invest;
  return (
    <>
      <PreviewBadge />
      <View style={{ alignItems: 'center', paddingVertical: space.xxl }}>
        <Text style={[type.subhead, { color: c.textMuted }]}>Your investments</Text>
        <Text style={[type.hero, { color: c.text, fontSize: 56, marginTop: 4 }]}>{formatMoney(inv.totalMinor, { cents: false })}</Text>
        <Text style={[type.subhead, { color: c.positive, marginTop: 6 }]}>Up {inv.changePct}% this month</Text>
      </View>

      <SectionHeader title="What you own" />
      <Card>
        {inv.holdings.map((h, i) => (
          <View key={h.symbol} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderBottomWidth: i < inv.holdings.length - 1 ? 0.5 : 0, borderBottomColor: c.border }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type.caption, { color: a.accent, fontSize: 10 }]}>{h.symbol}</Text>
            </View>
            <Text style={[type.bodyStrong, { color: c.text, flex: 1 }]}>{h.symbol}</Text>
            <Text style={[type.bodyStrong, { color: c.text }]}>{formatMoney(h.valueMinor, { cents: false })}</Text>
          </View>
        ))}
      </Card>
      <Card style={{ padding: space.lg, marginTop: 12, alignItems: 'center' }} onPress={() => {}}>
        <Text style={[type.bodyStrong, { color: a.accent }]}>Explore stocks & funds</Text>
      </Card>
    </>
  );
}

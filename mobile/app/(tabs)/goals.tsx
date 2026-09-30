import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Card, formatMoney, PreviewBadge, ProgressBar, Screen, SectionHeader, useAccent } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { preview as p } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

export default function Goals() {
  return (
    <Screen section="goals" eyebrow="Saving for" title="Goals" right={<NewGoal />}>
      <Body />
    </Screen>
  );
}

function NewGoal() {
  const a = useAccent();
  return (
    <View accessibilityLabel="New goal" style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="plus" size={20} color={a.accent} />
    </View>
  );
}

function Ring({ value, size = 120 }: { value: number; size?: number }) {
  const c = useColors();
  const a = useAccent();
  const r = size / 2 - 8, circ = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surface2} strokeWidth={10} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={a.accent} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={`${circ * value} ${circ}`} />
    </Svg>
  );
}

function Body() {
  const c = useColors();
  const a = useAccent();
  const saved = p.goals.reduce((s, g) => s + g.currentMinor, 0);
  const target = p.goals.reduce((s, g) => s + g.targetMinor, 0);
  const monthly = p.goals.reduce((s, g) => s + g.monthlyMinor, 0);

  return (
    <>
      <PreviewBadge />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xl }}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Ring value={saved / target} />
          <Text style={[type.title2, { color: c.text, position: 'absolute' }]}>{Math.round((saved / target) * 100)}%</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.subhead, { color: c.textMuted }]}>Saved across goals</Text>
          <Text style={[type.title2, { color: c.text, marginTop: 2 }]}>{formatMoney(saved, { cents: false })}</Text>
          <Text style={[type.footnote, { color: c.textMuted, marginTop: 4 }]}>of {formatMoney(target, { cents: false })}</Text>
        </View>
      </View>

      <View style={{ backgroundColor: a.soft, borderRadius: 14, padding: 12, marginTop: space.xl }}>
        <Text style={[type.footnote, { color: c.text, lineHeight: 18 }]}>
          Your goals need <Text style={{ fontWeight: '700' }}>{formatMoney(monthly, { cents: false })}/month</Text>. Based on the last 3 months you have about $1,650 spare — you're covered.
        </Text>
      </View>

      <SectionHeader title="Your goals" />
      <View style={{ gap: 12 }}>
        {p.goals.map((g) => {
          const behind = g.status !== 'On track';
          return (
            <Card key={g.id} style={{ padding: space.lg }} onPress={() => {}}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={g.icon} size={19} color={a.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.headline, { color: c.text }]}>{g.name}</Text>
                  <Text style={[type.footnote, { color: c.textMuted }]}>By {g.by} · {formatMoney(g.monthlyMinor, { cents: false })}/mo</Text>
                </View>
                <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, backgroundColor: behind ? c.surface2 : a.soft }}>
                  <Text style={[type.caption, { color: behind ? c.warning : a.accent }]}>{g.status}</Text>
                </View>
              </View>
              <View style={{ marginTop: 14 }}><ProgressBar value={g.currentMinor / g.targetMinor} /></View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={[type.footnote, { color: c.text }]}>{formatMoney(g.currentMinor, { cents: false })}</Text>
                <Text style={[type.footnote, { color: c.textMuted }]}>{formatMoney(g.targetMinor, { cents: false })}</Text>
              </View>
            </Card>
          );
        })}
      </View>
    </>
  );
}

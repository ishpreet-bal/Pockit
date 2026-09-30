import { Text, View } from 'react-native';
import { Card, formatMoney, PreviewBadge, ProgressBar, Screen, useAccent } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { preview as p } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

/** Goals: total saved, then each goal with progress, pace and a plain status. */
export default function Goals() {
  return (
    <Screen section="goals" title="Goals">
      <Body />
    </Screen>
  );
}

function Body() {
  const c = useColors();
  const a = useAccent();
  const saved = p.goals.reduce((s, g) => s + g.currentMinor, 0);
  return (
    <>
      <PreviewBadge />
      <Text style={[type.subhead, { color: c.textMuted }]}>Saved so far</Text>
      <Text style={[type.hero, { color: c.text, marginTop: 2 }]}>{formatMoney(saved, { cents: false })}</Text>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: 4, marginBottom: space.xl }]}>across {p.goals.length} goals · you're covering what they need each month</Text>

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
                  <Text style={[type.footnote, { color: c.textMuted }]}>By {g.by}</Text>
                </View>
                <Text style={[type.caption, { color: behind ? c.warning : a.accent }]}>{g.status}</Text>
              </View>
              <View style={{ marginTop: 14 }}><ProgressBar value={g.currentMinor / g.targetMinor} height={8} /></View>
              <Text style={[type.footnote, { color: c.textMuted, marginTop: 8 }]}>
                {formatMoney(g.currentMinor, { cents: false })} of {formatMoney(g.targetMinor, { cents: false })} · {formatMoney(g.monthlyMinor, { cents: false })}/month
              </Text>
            </Card>
          );
        })}
      </View>
      <Card style={{ padding: space.lg, marginTop: 12, alignItems: 'center' }} onPress={() => {}}>
        <Text style={[type.bodyStrong, { color: a.accent }]}>+ Add a goal</Text>
      </Card>
    </>
  );
}

import { Text, View } from 'react-native';
import { Card, formatMoney, PreviewBadge, ProgressBar, Screen, useAccent } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { preview as p } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

/** Goals: what you're saving for and how far along you are. Nothing else. */
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
  return (
    <>
      <PreviewBadge />
      <View style={{ gap: 12, marginTop: space.sm }}>
        {p.goals.map((g) => (
          <Card key={g.id} style={{ padding: space.xl }} onPress={() => {}}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={g.icon} size={19} color={a.accent} />
              </View>
              <Text style={[type.headline, { color: c.text, flex: 1 }]}>{g.name}</Text>
              <Text style={[type.headline, { color: a.accent }]}>{Math.round((g.currentMinor / g.targetMinor) * 100)}%</Text>
            </View>
            <View style={{ marginTop: 16 }}><ProgressBar value={g.currentMinor / g.targetMinor} height={8} /></View>
            <Text style={[type.footnote, { color: c.textMuted, marginTop: 10 }]}>
              {formatMoney(g.currentMinor, { cents: false })} of {formatMoney(g.targetMinor, { cents: false })}
            </Text>
          </Card>
        ))}
      </View>
      <Card style={{ padding: space.lg, marginTop: 12, alignItems: 'center', borderStyle: 'dashed' }} onPress={() => {}}>
        <Text style={[type.bodyStrong, { color: a.accent }]}>+ Add a goal</Text>
      </Card>
    </>
  );
}

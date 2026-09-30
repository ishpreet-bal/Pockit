import { Text, View } from 'react-native';
import { Card, Row, Screen, SectionHeader } from '@/components/ui';
import { PockMark } from '@/components/Pock';
import { space, type, useColors } from '@/theme/tokens';

const GROUPS = [
  {
    title: 'Money',
    items: [
      { icon: 'repeat', title: 'Bills & subscriptions', detail: '6 active' },
      { icon: 'calendar', title: 'Calendar', detail: 'Paydays and due dates' },
      { icon: 'building.columns', title: 'Accounts', detail: '3 accounts' },
      { icon: 'chart.bar', title: 'Budget', detail: 'Plan by category' },
    ],
  },
  {
    title: 'You',
    items: [
      { icon: 'square.and.arrow.down', title: 'Import', detail: 'Bank statements, CSV, photos' },
      { icon: 'gearshape', title: 'Settings', detail: 'Face ID, notifications, appearance' },
    ],
  },
];

export default function More() {
  return (
    <Screen section="more" title="More">
      <Body />
    </Screen>
  );
}

function Body() {
  const c = useColors();
  return (
    <>
      <Card style={{ padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: c.section.home.soft, borderColor: 'transparent' }} onPress={() => {}}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <PockMark color={c.section.home.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.headline, { color: c.text }]}>Ask Pock</Text>
          <Text style={[type.footnote, { color: c.textMuted }]}>“Can I afford a $200 concert this month?”</Text>
        </View>
      </Card>
      {GROUPS.map((g) => (
        <View key={g.title}>
          <SectionHeader title={g.title} />
          <Card>
            {g.items.map((it, i) => (
              <Row key={it.title} icon={it.icon} title={it.title} detail={it.detail} value="›" valueColor={c.textSubtle} last={i === g.items.length - 1} onPress={() => {}} />
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}

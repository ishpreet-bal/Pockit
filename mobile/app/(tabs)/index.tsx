import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, formatMoney, PreviewBadge, Row, Screen, SectionHeader, useAccent } from '@/components/ui';
import { PockButton, PockMark } from '@/components/Pock';
import { preview as p } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

/**
 * Home answers one question: how much can I spend? Everything else is a tap away.
 */
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
  const next = p.upcoming[0];
  return (
    <>
      <PreviewBadge />
      <View style={{ alignItems: 'center', paddingVertical: space.xxl }}>
        <Text style={[type.subhead, { color: c.textMuted }]}>You can spend</Text>
        <Text style={[type.hero, { color: c.text, fontSize: 56, marginTop: 4 }]}>{formatMoney(p.safeToSpendMinor, { cents: false })}</Text>
        <Text style={[type.subhead, { color: c.textMuted, marginTop: 6, textAlign: 'center' }]}>until payday on {p.nextIncome.date}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: a.soft, borderRadius: 16, padding: 14 }}>
        <PockMark color={a.accent} size={22} />
        <Text style={[type.subhead, { color: c.text, flex: 1 }]}>Your bills are covered. You're doing well.</Text>
      </View>

      <SectionHeader title="Next bill" action="All bills" />
      <Card>
        <Row icon={next.icon} title={next.name} detail={`Due ${next.date}`} value={formatMoney(next.amountMinor, { cents: false })} last />
      </Card>

      <SectionHeader title="Your goal" />
      <Card onPress={() => router.push('/goals')}>
        <Row icon="lifepreserver" title={p.goals[0].name} detail={`${Math.round((p.goals[0].currentMinor / p.goals[0].targetMinor) * 100)}% saved`} value="›" valueColor={c.textSubtle} last />
      </Card>
    </>
  );
}

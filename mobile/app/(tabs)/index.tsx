import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Icon } from '@/components/Icon';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Card, Divider, PreviewBadge, Screen, SectionHeader, formatMoney } from '@/components/ui';
import { Otter } from '@/components/Otter';
import { colors, radius, space, type } from '@/theme/tokens';
import { preview as d } from '@/data/preview';

/**
 * Home answers four questions, in this order:
 *   How much can I spend?     — the hero
 *   What's about to leave?    — three bills
 *   Am I getting anywhere?    — the top goal
 *   What about investing?     — one card
 *
 * Pock sits top-right where an iOS app puts the profile picture: always there,
 * never floating over the content.
 */
export default function HomeScreen() {
  const router = useRouter();
  const goalFraction = d.goal.currentMinor / d.goal.targetMinor;

  return (
    <Screen
      title={`Hi ${d.name}`}
      right={
        <Pressable
          onPress={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          accessibilityLabel="Ask Pock"
          style={s.pock}
        >
          <Otter size={40} />
        </Pressable>
      }
    >
      <PreviewBadge />

      <View style={s.hero}>
        <Text style={[type.subhead, { color: colors.textMuted }]}>Safe to spend</Text>
        <Text style={[type.hero, { color: colors.text, marginTop: 2 }]}>
          {formatMoney(d.safeToSpendMinor, { cents: false })}
        </Text>
        <Text style={[type.footnote, { color: colors.textSubtle, marginTop: space.xs }]}>
          {formatMoney(d.cashMinor, { cents: false })} in your accounts, minus{' '}
          {formatMoney(d.billsLeftMinor, { cents: false })} of bills still due
        </Text>
      </View>

      <SectionHeader title="Coming up" action="All bills" />
      <Card>
        {d.upcoming.map((bill, i) => (
          <View key={bill.id}>
            {i > 0 ? <Divider /> : null}
            <View style={s.row}>
              <View style={s.rowIcon}>
                <Icon name={bill.icon} size={17} color={colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: colors.text }]}>{bill.name}</Text>
                <Text style={[type.footnote, { color: colors.textSubtle }]}>{bill.date}</Text>
              </View>
              <Text style={[type.body, s.num, { color: colors.text }]}>{formatMoney(-bill.amountMinor)}</Text>
            </View>
          </View>
        ))}
      </Card>
      <Text style={[type.footnote, { color: colors.textSubtle, marginTop: space.sm, marginLeft: space.xs }]}>
        Next money in: {d.nextIncome.name}, {formatMoney(d.nextIncome.amountMinor, { cents: false })} on {d.nextIncome.date}
      </Text>

      <View style={s.pair}>
        <Card style={s.tile} onPress={() => router.push('/goals')}>
          <Text style={s.eyebrow}>GOALS</Text>
          <Text style={[type.headline, { color: colors.text, marginTop: space.sm }]} numberOfLines={1}>{d.goal.name}</Text>
          <View style={s.track}><View style={[s.fill, { width: `${goalFraction * 100}%` }]} /></View>
          <Text style={[type.footnote, { color: colors.textMuted, marginTop: space.sm }]}>
            {formatMoney(d.goal.currentMinor, { cents: false })} of {formatMoney(d.goal.targetMinor, { cents: false })}
          </Text>
        </Card>

        <Card style={s.tile} onPress={() => router.push('/invest')}>
          <Text style={s.eyebrow}>INVESTING</Text>
          <Text style={[type.headline, { color: colors.text, marginTop: space.sm }]}>{d.investing.count} investments</Text>
          <View style={s.chips}>
            {d.investing.symbols.map((sym) => (
              <View key={sym} style={s.chip}><Text style={[type.caption, { color: colors.text }]}>{sym}</Text></View>
            ))}
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  pock: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong,
  },
  hero: { marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 14 },
  rowIcon: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  num: { fontVariant: ['tabular-nums'] },
  pair: { flexDirection: 'row', gap: space.md, marginTop: space.xxl },
  tile: { flex: 1, padding: space.lg, minHeight: 128 },
  eyebrow: { ...type.caption, color: colors.textSubtle, letterSpacing: 0.8 },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surface3, marginTop: space.md, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.goal, borderRadius: radius.pill },
  chips: { flexDirection: 'row', gap: 6, marginTop: space.md, flexWrap: 'wrap' },
  chip: { backgroundColor: colors.surface2, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
});

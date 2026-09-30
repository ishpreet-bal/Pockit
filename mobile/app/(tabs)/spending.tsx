import { Text, View } from 'react-native';
import { Card, formatMoney, PreviewBadge, ProgressBar, Row, Screen, SectionHeader, Segmented, useAccent, useSegment } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { preview as p } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

const PERIODS = ['This month', 'Last month'] as const;

export default function Spending() {
  return (
    <Screen section="spending" eyebrow="September" title="Spending" right={<AddButton />}>
      <Body />
    </Screen>
  );
}

function AddButton() {
  const a = useAccent();
  return (
    <View accessibilityLabel="Add spending" style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="plus" size={20} color={a.accent} />
    </View>
  );
}

function Body() {
  const c = useColors();
  const a = useAccent();
  const [period, setPeriod] = useSegment<(typeof PERIODS)[number]>('This month');
  const s = p.spending;
  const left = s.budgetMinor - s.spentMinor;
  const monthPct = s.dayOfMonth / s.daysInMonth;
  const spentPct = s.spentMinor / s.budgetMinor;

  return (
    <>
      <PreviewBadge />
      <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      <Text style={[type.subhead, { color: c.textMuted, marginTop: space.lg }]}>Spent so far</Text>
      <Text style={[type.hero, { color: c.text, marginTop: 2 }]}>{formatMoney(s.spentMinor)}</Text>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: 4 }]}>
        of {formatMoney(s.budgetMinor, { cents: false })} planned · <Text style={{ color: c.positive }}>{formatMoney(left, { cents: false })} left</Text>
      </Text>

      <View style={{ marginTop: space.lg }}>
        <ProgressBar value={spentPct} height={10} />
        {/* where "on pace" would be: the share of the month gone */}
        <View style={{ position: 'absolute', left: `${monthPct * 100}%`, top: -4, width: 2, height: 18, borderRadius: 1, backgroundColor: c.text, opacity: 0.35 }} />
      </View>
      <Text style={[type.caption, { color: c.textMuted, marginTop: 8 }]}>
        {spentPct <= monthPct ? 'Under pace — nicely done.' : 'Spending a little faster than the month.'}
      </Text>

      <SectionHeader title="By category" action="Budget" />
      <Card>
        {s.categories.map((cat, i) => {
          const over = cat.spentMinor > cat.budgetMinor;
          return (
            <View key={cat.name} style={{ paddingHorizontal: space.lg, paddingVertical: 13, borderBottomWidth: i < s.categories.length - 1 ? 0.5 : 0, borderBottomColor: c.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={cat.icon} size={17} color={a.accent} />
                </View>
                <Text style={[type.body, { color: c.text, flex: 1 }]}>{cat.name}</Text>
                <Text style={[type.bodyStrong, { color: over ? c.negative : c.text }]}>{formatMoney(cat.spentMinor, { cents: false })}</Text>
              </View>
              <View style={{ marginTop: 10, marginLeft: 48 }}>
                <ProgressBar value={cat.spentMinor / cat.budgetMinor} height={4} />
                <Text style={[type.caption, { color: over ? c.negative : c.textSubtle, marginTop: 5 }]}>
                  {over ? `${formatMoney(cat.spentMinor - cat.budgetMinor, { cents: false })} over` : `${formatMoney(cat.budgetMinor - cat.spentMinor, { cents: false })} left`} of {formatMoney(cat.budgetMinor, { cents: false })}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>

      <SectionHeader title="Recent" action="See all" />
      <Card>
        {s.recent.map((t, i) => (
          <Row
            key={t.id}
            icon={t.icon}
            title={t.name}
            detail={`${t.category} · ${t.date}`}
            value={formatMoney(t.amountMinor, { signed: true })}
            valueColor={t.amountMinor > 0 ? c.positive : undefined}
            last={i === s.recent.length - 1}
          />
        ))}
      </Card>
    </>
  );
}

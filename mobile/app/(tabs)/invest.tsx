import { Text, useWindowDimensions, View } from 'react-native';
import { Card, formatMoney, PreviewBadge, Screen, SectionHeader, useAccent } from '@/components/ui';
import { LineChart } from '@/components/LineChart';
import { preview as p } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

/** Invest: total value and its trend, what you own, and a short watchlist. */
export default function Invest() {
  return (
    <Screen section="invest" title="Invest">
      <Body />
    </Screen>
  );
}

function Line({ symbol, name, value, pct, last }: { symbol: string; name: string; value: string; pct: number; last: boolean }) {
  const c = useColors();
  const a = useAccent();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: c.border }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[type.caption, { color: a.accent, fontSize: 10 }]}>{symbol}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, { color: c.text }]}>{symbol}</Text>
        <Text style={[type.footnote, { color: c.textMuted }]} numberOfLines={1}>{name}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[type.bodyStrong, { color: c.text }]}>{value}</Text>
        <Text style={[type.footnote, { color: pct >= 0 ? c.positive : c.negative }]}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}%</Text>
      </View>
    </View>
  );
}

function Body() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const inv = p.invest;
  return (
    <>
      <PreviewBadge />
      <Text style={[type.subhead, { color: c.textMuted }]}>Your investments</Text>
      <Text style={[type.hero, { color: c.text, marginTop: 2 }]}>{formatMoney(inv.totalMinor, { cents: false })}</Text>
      <Text style={[type.footnote, { color: c.positive, marginTop: 4 }]}>▲ {formatMoney(inv.changeMinor, { cents: false })} ({inv.changePct}%) this month</Text>
      <View style={{ marginHorizontal: -space.xl, marginTop: space.lg }}>
        <LineChart values={[...inv.series]} labels={[...p.balanceSeries.labels]} width={width} height={90} format={(v) => formatMoney(v, { cents: false })} />
      </View>

      <SectionHeader title="What you own" />
      <Card>
        {inv.holdings.map((h, i) => (
          <Line key={h.symbol} symbol={h.symbol} name={h.name} value={formatMoney(h.valueMinor, { cents: false })} pct={h.changePct} last={i === inv.holdings.length - 1} />
        ))}
      </Card>

      <SectionHeader title="Watching" action="Explore" />
      <Card>
        {inv.watchlist.slice(0, 2).map((w, i) => (
          <Line key={w.symbol} symbol={w.symbol} name={w.name} value={formatMoney(w.priceMinor)} pct={w.changePct} last={i === 1} />
        ))}
      </Card>
      <Text style={[type.caption, { color: c.textSubtle, marginTop: space.md, textAlign: 'center' }]}>Pockit helps you follow investments. It never buys or sells.</Text>
    </>
  );
}

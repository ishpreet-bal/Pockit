import { Text, useWindowDimensions, View } from 'react-native';
import { Card, formatMoney, PreviewBadge, Screen, SectionHeader, Segmented, useAccent, useSegment } from '@/components/ui';
import { LineChart } from '@/components/LineChart';
import { Icon } from '@/components/Icon';
import { preview as p } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

const RANGES = ['1D', '1W', '1M', '1Y', 'All'] as const;

export default function Invest() {
  return (
    <Screen section="invest" eyebrow="Portfolio" title="Invest" right={<SearchButton />}>
      <Body />
    </Screen>
  );
}

function SearchButton() {
  const a = useAccent();
  return (
    <View accessibilityLabel="Search stocks and funds" style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="magnifyingglass" size={19} color={a.accent} />
    </View>
  );
}

function Ticker({ symbol }: { symbol: string }) {
  const a = useAccent();
  return (
    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[type.caption, { color: a.accent, fontSize: 10 }]}>{symbol.slice(0, 4)}</Text>
    </View>
  );
}

function Change({ pct }: { pct: number }) {
  const c = useColors();
  const up = pct >= 0;
  return <Text style={[type.footnote, { color: up ? c.positive : c.negative }]}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</Text>;
}

function Body() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const [range, setRange] = useSegment<(typeof RANGES)[number]>('1M');
  const inv = p.invest;

  return (
    <>
      <PreviewBadge />
      <Text style={[type.subhead, { color: c.textMuted }]}>Total value</Text>
      <Text style={[type.hero, { color: c.text, marginTop: 2 }]}>{formatMoney(inv.totalMinor)}</Text>
      <Text style={[type.footnote, { color: c.positive, marginTop: 4 }]}>▲ {formatMoney(inv.changeMinor)} ({inv.changePct}%) this month</Text>

      <View style={{ marginHorizontal: -space.xl, marginTop: space.lg }}>
        <LineChart values={[...inv.series]} labels={p.balanceSeries.labels.slice()} width={width} format={(v) => formatMoney(v, { cents: false })} />
      </View>
      <View style={{ marginTop: space.sm }}><Segmented options={RANGES} value={range} onChange={setRange} /></View>

      <SectionHeader title="Holdings" />
      <Card>
        {inv.holdings.map((h, i) => (
          <View key={h.symbol} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderBottomWidth: i < inv.holdings.length - 1 ? 0.5 : 0, borderBottomColor: c.border }}>
            <Ticker symbol={h.symbol} />
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: c.text }]}>{h.symbol}</Text>
              <Text style={[type.footnote, { color: c.textMuted }]} numberOfLines={1}>{h.name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[type.bodyStrong, { color: c.text }]}>{formatMoney(h.valueMinor, { cents: false })}</Text>
              <Change pct={h.changePct} />
            </View>
          </View>
        ))}
      </Card>

      <SectionHeader title="Watchlist" action="Edit" />
      <Card>
        {inv.watchlist.map((w, i) => (
          <View key={w.symbol} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderBottomWidth: i < inv.watchlist.length - 1 ? 0.5 : 0, borderBottomColor: c.border }}>
            <Ticker symbol={w.symbol} />
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyStrong, { color: c.text }]}>{w.symbol}</Text>
              <Text style={[type.footnote, { color: c.textMuted }]}>{w.name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[type.bodyStrong, { color: c.text }]}>{formatMoney(w.priceMinor)}</Text>
              <Change pct={w.changePct} />
            </View>
          </View>
        ))}
      </Card>
      <Text style={[type.caption, { color: c.textSubtle, marginTop: space.md, textAlign: 'center' }]}>
        Pockit helps you follow investments. It never buys or sells.
      </Text>
    </>
  );
}

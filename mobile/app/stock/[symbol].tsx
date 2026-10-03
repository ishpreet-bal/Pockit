import { useCallback, useEffect, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Card, EmptyCard, formatMoney, Loading, Screen, SectionHeader, Segmented, useAccent } from '@/components/ui';
import { LineChart } from '@/components/LineChart';
import { Button } from '@/components/form';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';

interface Stock {
  symbol: string; name: string; kind: string; exchange: string | null; currency: string; description: string | null;
  sector: string | null; tracks: string | null; expenseRatioBps: number | null;
  priceMinor: number | null; changeMinor: number | null; changePct: number | null; dayHighMinor: number | null; dayLowMinor: number | null;
  simulated: boolean; watching: boolean; owned: { units: number; valueMinor: number } | null;
}
interface History { available: boolean; points?: { t: string; close: number }[] }

const RANGES = ['1D', '5D', '1M', '6M', '1Y', '5Y'] as const;
type Range = (typeof RANGES)[number];

const PREVIEW_STOCK: Stock = {
  symbol: 'NVDA', name: 'NVIDIA Corporation', kind: 'stock', exchange: 'NASDAQ', currency: 'USD', description: 'Designs graphics processors and the chips that power most AI.',
  sector: 'Technology', tracks: null, expenseRatioBps: null, priceMinor: 18_842, changeMinor: 333, changePct: 1.8, dayHighMinor: 19_010, dayLowMinor: 18_530,
  simulated: false, watching: true, owned: null,
};

/** One stock or fund: price, a chart you can scrub, what it is, and follow/unfollow. Nothing here buys or sells. */
export default function StockPage() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const [stock, setStock] = useState<Stock | null>(PREVIEW ? { ...PREVIEW_STOCK, symbol: symbol ?? 'NVDA' } : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (PREVIEW || !symbol) return;
    api<Stock>(`/api/mobile/stock?symbol=${encodeURIComponent(symbol)}`).then(setStock).catch((e) => setError(e instanceof Error ? e.message : 'Could not load.'));
  }, [symbol]);

  return (
    <Screen section="invest" title={symbol ?? ''} back>
      {stock ? <Body stock={stock} setStock={setStock} /> : error ? <EmptyCard title="Couldn’t load this one" body={error} /> : <Loading error={null} />}
    </Screen>
  );
}

function Body({ stock, setStock }: { stock: Stock; setStock: (s: Stock) => void }) {
  const c = useColors();
  const a = useAccent();
  const { width } = useWindowDimensions();
  const { refresh } = useSummary();
  const [range, setRange] = useState<Range>('1M');
  const [points, setPoints] = useState<{ t: string; close: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const money = (minor: number) => `${formatMoney(minor)}${stock.currency !== 'CAD' ? ` ${stock.currency}` : ''}`;

  const loadHistory = useCallback(async () => {
    if (PREVIEW) { setPoints(Array.from({ length: 30 }, (_, i) => ({ t: `2026-09-${String(i + 1).padStart(2, '0')}`, close: 170 + Math.sin(i / 3) * 6 + i * 0.6 }))); return; }
    setPoints(null);
    const h = await api<History>(`/api/market/history?symbol=${encodeURIComponent(stock.symbol)}&range=${range}`).catch(() => null);
    setPoints(h?.available && h.points ? h.points : []);
  }, [range, stock.symbol]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  async function toggleWatch() {
    setBusy(true);
    try {
      if (!PREVIEW) {
        if (stock.watching) await api(`/api/investing/watchlist?symbol=${encodeURIComponent(stock.symbol)}`, { method: 'DELETE' });
        else await api('/api/investing/watchlist', { body: { symbol: stock.symbol, name: stock.name } });
        void refresh();
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStock({ ...stock, watching: !stock.watching });
    } finally { setBusy(false); }
  }

  const label = (t: string) => {
    const d = new Date(t);
    return range === '1D' ? d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', ...(range === '1Y' || range === '5Y' ? { year: 'numeric' } : {}) });
  };
  const up = (stock.changePct ?? 0) >= 0;
  const first = points?.[0]?.close, last = points?.[points.length - 1]?.close;
  const rangeUp = first !== undefined && last !== undefined ? last >= first : up;

  return (
    <>
      <Text style={[type.subhead, { color: c.textMuted, marginTop: -space.sm }]}>{stock.name}</Text>
      {stock.priceMinor !== null ? (
        <>
          <Text style={[type.hero, { color: c.text, marginTop: space.sm }]}>{money(stock.priceMinor)}</Text>
          {stock.changePct !== null ? (
            <Text style={[type.footnote, { color: up ? c.positive : c.negative, marginTop: 4 }]}>
              {up ? '▲' : '▼'} {money(Math.abs(stock.changeMinor ?? 0))} ({Math.abs(stock.changePct).toFixed(2)}%) today
            </Text>
          ) : null}
        </>
      ) : <Text style={[type.subhead, { color: c.textMuted, marginTop: space.md }]}>No live price right now.</Text>}
      {stock.simulated ? (
        <Text style={[type.caption, { color: c.warning, marginTop: 6 }]}>Sample prices — live market data isn’t connected.</Text>
      ) : null}

      <View style={{ marginHorizontal: -space.xl, marginTop: space.lg, minHeight: 150 }}>
        {points === null ? <Loading error={null} /> : points.length > 1 ? (
          <View style={{ opacity: 1 }}>
            <LineChart values={points.map((p) => p.close * 100)} labels={points.map((p) => label(p.t))} width={width} height={140} format={(v) => money(Math.round(v))} />
            <View style={{ position: 'absolute', right: space.xl, top: 0 }}>
              <Text style={[type.caption, { color: rangeUp ? c.positive : c.negative }]}>{rangeUp ? '▲' : '▼'} {first ? Math.abs(((last! - first) / first) * 100).toFixed(1) : '0'}% over {range}</Text>
            </View>
          </View>
        ) : <Text style={[type.footnote, { color: c.textMuted, textAlign: 'center', marginTop: space.xl }]}>No chart for this range.</Text>}
      </View>
      <View style={{ marginTop: space.sm }}><Segmented options={RANGES} value={range} onChange={setRange} /></View>

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        <Button label={stock.watching ? '★ Watching' : '☆ Watch'} variant={stock.watching ? 'secondary' : 'primary'} accent={a.accent} loading={busy} onPress={toggleWatch} />
        {stock.watching ? <Text style={[type.caption, { color: c.textMuted, textAlign: 'center' }]}>Tap again to stop watching.</Text> : null}
      </View>

      {stock.owned ? (
        <>
          <SectionHeader title="You own" />
          <Card style={{ paddingVertical: space.lg }}>
            <Text style={[type.headline, { color: c.text }]}>{stock.owned.units} {stock.owned.units === 1 ? 'share' : 'shares'} · {formatMoney(stock.owned.valueMinor, { cents: false })}</Text>
          </Card>
        </>
      ) : null}

      <SectionHeader title="About" />
      <Card style={{ paddingVertical: space.lg, gap: 8 }}>
        {stock.description ? <Text style={[type.subhead, { color: c.text, lineHeight: 21 }]} numberOfLines={6}>{stock.description}</Text> : null}
        {[
          ['Type', stock.kind === 'etf' ? 'Fund (ETF)' : stock.kind === 'crypto' ? 'Crypto' : 'Stock'],
          ['Exchange', stock.exchange],
          ['Sector', stock.sector],
          ['Tracks', stock.tracks],
          ['Yearly fee', stock.expenseRatioBps !== null ? `${(stock.expenseRatioBps / 100).toFixed(2)}%` : null],
          ['Today’s range', stock.dayLowMinor !== null && stock.dayHighMinor !== null ? `${money(stock.dayLowMinor)} – ${money(stock.dayHighMinor)}` : null],
        ].filter(([, v]) => v).map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
            <Text style={[type.subhead, { color: c.textMuted }]}>{k}</Text>
            <Text style={[type.subhead, { color: c.text, flexShrink: 1, textAlign: 'right' }]}>{v}</Text>
          </View>
        ))}
      </Card>
      <Text style={[type.caption, { color: c.textSubtle, marginTop: space.lg, textAlign: 'center' }]}>For learning and tracking only. Pockit never buys or sells, and this isn’t advice.</Text>
    </>
  );
}

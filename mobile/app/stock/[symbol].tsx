import { useEffect, useState } from 'react';
import { HomeButton, InvestingGate } from '@/components/InvestingGate';
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
  simulated: boolean; source?: string | null; asOf?: string | null; watching: boolean; owned: { units: number; valueMinor: number; values?: { currency: string; valueMinor: number; recordedCount: number }[] } | null;
}
interface History { available: boolean; points?: { t: string; close: number }[]; simulated?: boolean; source?: string; asOf?: string }

const RANGES = ['1D', '5D', '1M', '6M', '1Y', '5Y'] as const;
type Range = (typeof RANGES)[number];

const PREVIEW_STOCK: Stock = {
  symbol: 'NVDA', name: 'NVIDIA Corporation', kind: 'stock', exchange: 'NASDAQ', currency: 'USD', description: 'Designs graphics processors and the chips that power most AI.',
  sector: 'Technology', tracks: null, expenseRatioBps: null, priceMinor: 18_842, changeMinor: 333, changePct: 1.8, dayHighMinor: 19_010, dayLowMinor: 18_530,
  simulated: true, source: 'Demo data', watching: true, owned: null,
};

/** One stock or fund: price, a chart you can scrub, what it is, and follow/unfollow. Nothing here buys or sells. */
export default function StockPageGated() {
  return <InvestingGate><StockPage /></InvestingGate>;
}

function StockPage() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const [stock, setStock] = useState<Stock | null>(PREVIEW ? sampleStock(symbol ?? 'NVDA') : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (PREVIEW || !symbol) return;
    let active = true;
    setStock(null); setError(null);
    api<Stock>(`/api/mobile/stock?symbol=${encodeURIComponent(symbol)}`).then((s) => { if (active) setStock(s); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Could not load.'); });
    return () => { active = false; };
  }, [symbol]);

  return (
    <Screen section="invest" title={symbol ?? ''} back right={<HomeButton />}>
      {stock ? <Body key={stock.symbol} stock={stock} setStock={setStock} /> : error ? <EmptyCard title="Couldn’t load this one" body={error} /> : <Loading error={null} />}
    </Screen>
  );
}

function sampleStock(symbol: string): Stock {
  if (symbol === 'NVDA') return PREVIEW_STOCK;
  const names: Record<string, string> = { AAPL: 'Apple', XEQT: 'iShares Core Equity ETF Portfolio', VFV: 'Vanguard S&P 500 Index ETF', SHOP: 'Shopify' };
  return { ...PREVIEW_STOCK, symbol, name: names[symbol] ?? symbol, kind: ['XEQT', 'VFV'].includes(symbol) ? 'etf' : 'stock', currency: ['XEQT', 'VFV', 'SHOP'].includes(symbol) ? 'CAD' : 'USD', exchange: ['XEQT', 'VFV', 'SHOP'].includes(symbol) ? 'TSX' : null, description: null, sector: null, watching: false };
}

function Body({ stock, setStock }: { stock: Stock; setStock: (s: Stock) => void }) {
  const c = useColors();
  const a = useAccent();
  const { width } = useWindowDimensions();
  const { refresh } = useSummary();
  const [range, setRange] = useState<Range>('1M');
  const [points, setPoints] = useState<{ t: string; close: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const money = (minor: number) => formatMoney(minor, { currency: stock.currency });

  useEffect(() => {
    if (PREVIEW) { setPoints(Array.from({ length: 30 }, (_, i) => ({ t: `2026-09-${String(i + 1).padStart(2, '0')}`, close: 170 + Math.sin(i / 3) * 6 + i * 0.6 }))); return; }
    let active = true;
    setPoints(null); setHistory(null); setHistoryError(null);
    api<History>(`/api/market/history?symbol=${encodeURIComponent(stock.symbol)}&range=${range}`).then((h) => {
      if (active) { setHistory(h); setPoints(h.available && h.points ? h.points : []); }
    }).catch(() => { if (active) { setPoints([]); setHistoryError('Couldn’t load this chart. Try again.'); } });
    return () => { active = false; };
  }, [range, stock.symbol, retry]);

  async function toggleWatch() {
    if (busy) return;
    setBusy(true); setWatchError(null);
    try {
      if (!PREVIEW) {
        if (stock.watching) await api(`/api/investing/watchlist?symbol=${encodeURIComponent(stock.symbol)}`, { method: 'DELETE' });
        else await api('/api/investing/watchlist', { body: { symbol: stock.symbol, name: stock.name } });
        void refresh();
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStock({ ...stock, watching: !stock.watching });
    } catch (e) { setWatchError(e instanceof Error ? e.message : 'Couldn’t update your watchlist. Try again.'); }
    finally { setBusy(false); }
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
      {!stock.simulated && stock.source ? <Text style={[type.caption, { color: c.textMuted, marginTop: 6 }]}>{stock.source}{stock.asOf ? ` · as of ${stock.asOf}` : ''}. Quotes may be delayed.</Text> : null}

      <View style={{ marginHorizontal: -space.xl, marginTop: space.lg, minHeight: 150 }}>
        {points === null ? <Loading error={null} /> : points.length > 1 ? (
          <View style={{ opacity: 1 }}>
            <LineChart values={points.map((p) => p.close * 100)} labels={points.map((p) => label(p.t))} width={width} height={140} format={(v) => money(Math.round(v))} />
            <View style={{ position: 'absolute', right: space.xl, top: 0 }}>
              <Text style={[type.caption, { color: rangeUp ? c.positive : c.negative }]}>{rangeUp ? '▲' : '▼'} {first ? Math.abs(((last! - first) / first) * 100).toFixed(1) : '0'}% over {range}</Text>
            </View>
          </View>
        ) : <Text style={[type.footnote, { color: c.textMuted, textAlign: 'center', marginTop: space.xl }]}>{historyError ?? 'No chart for this range.'}</Text>}
      </View>
      {history?.simulated || PREVIEW ? <Text style={[type.caption, { color: c.warning }]}>Illustrative chart — sample data.</Text> : history?.source ? <Text style={[type.caption, { color: c.textMuted }]}>{history.source}{history.asOf ? ` · ${history.asOf}` : ''}</Text> : null}
      {historyError ? <Button label="Retry chart" variant="plain" onPress={() => setRetry((n) => n + 1)} /> : null}
      <View style={{ marginTop: space.sm }}><Segmented options={RANGES} value={range} onChange={setRange} /></View>

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        <Button label={stock.watching ? '★ Watching' : '☆ Watch'} variant={stock.watching ? 'secondary' : 'primary'} accent={a.accent} loading={busy} onPress={toggleWatch} />
        {stock.watching ? <Text style={[type.caption, { color: c.textMuted, textAlign: 'center' }]}>Tap again to stop watching.</Text> : null}
        {watchError ? <Text accessibilityRole="alert" style={[type.footnote, { color: c.negative }]}>{watchError}</Text> : null}
      </View>

      {stock.owned ? (
        <>
          <SectionHeader title="You own" />
          <Card style={{ paddingVertical: space.lg }}>
            <Text style={[type.headline, { color: c.text }]}>{stock.owned.units} {stock.owned.units === 1 ? 'share' : 'shares'}</Text>
            {(stock.owned.values ?? [{ currency: stock.currency, valueMinor: stock.owned.valueMinor, recordedCount: 0 }]).map((v) => <View key={v.currency}><Text style={[type.bodyStrong, { color: c.text }]}>{formatMoney(v.valueMinor, { currency: v.currency })}</Text>{v.recordedCount ? <Text style={[type.caption, { color: c.textMuted }]}>Includes recorded values.</Text> : null}</View>)}
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

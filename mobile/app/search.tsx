import { useEffect, useState } from 'react';
import { HomeButton, InvestingGate } from '@/components/InvestingGate';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Row, Screen, SectionHeader } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { font, radius, space, type, useColors } from '@/theme/tokens';

interface Result { symbol: string; name: string; kind: string; exchange: string | null }

const POPULAR: Result[] = [
  { symbol: 'XEQT', name: 'iShares Core Equity ETF Portfolio', kind: 'etf', exchange: 'TSX' },
  { symbol: 'VFV', name: 'Vanguard S&P 500 Index ETF', kind: 'etf', exchange: 'TSX' },
  { symbol: 'AAPL', name: 'Apple', kind: 'stock', exchange: 'NASDAQ' },
  { symbol: 'NVDA', name: 'NVIDIA', kind: 'stock', exchange: 'NASDAQ' },
  { symbol: 'SHOP', name: 'Shopify', kind: 'stock', exchange: 'TSX' },
];

const KIND: Record<string, string> = { stock: 'Stock', etf: 'Fund (ETF)', crypto: 'Crypto', index: 'Index' };

/** Find any stock, fund or coin by ticker or name. Typos are fine — "nvidea" finds NVIDIA. */
export default function SearchGated() {
  return <InvestingGate><Search /></InvestingGate>;
}

function Search() {
  const c = useColors();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const term = q.trim();
    setResults([]); setError(null); setSearching(false);
    if (!term) return;
    if (PREVIEW) { setResults(POPULAR.filter((r) => `${r.symbol} ${r.name}`.toLowerCase().includes(term.toLowerCase()))); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api<{ results: Result[] }>(`/api/market/search?q=${encodeURIComponent(term)}`)
        .then((r) => { if (active) setResults(r.results); }).catch(() => { if (active) setError('Search is unavailable right now. Edit your search to try again.'); }).finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [q]);

  const open = (symbol: string) => router.push({ pathname: '/stock/[symbol]', params: { symbol } });
  const list = q.trim() ? results : POPULAR;

  return (
    <Screen section="invest" title="Search" back right={<HomeButton />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, borderRadius: radius.control, backgroundColor: c.surface2, paddingHorizontal: 12, marginBottom: space.md }}>
        <Icon name="magnifyingglass" size={18} color={c.textSubtle} />
        <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Ticker or company — e.g. Apple, XEQT" placeholderTextColor={c.textSubtle}
          autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search stocks and funds"
          style={{ flex: 1, fontFamily: font.regular, fontSize: 17, color: c.text, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }} />
      </View>
      <SectionHeader title={q.trim() ? (searching && !results.length ? 'Searching…' : 'Results') : 'Popular with Canadians'} />
      {list.length ? (
        <Card>
          {list.map((r, i) => (
            <Row key={r.symbol} icon="chart.line.uptrend.xyaxis" title={`${r.symbol} · ${r.name}`} detail={[KIND[r.kind] ?? r.kind, r.exchange].filter(Boolean).join(' · ')}
              value="›" valueColor={c.textSubtle} last={i === list.length - 1} onPress={() => open(r.symbol)} />
          ))}
        </Card>
      ) : !searching ? (
        <Text style={[type.subhead, { color: error ? c.negative : c.textMuted, textAlign: 'center', marginTop: space.xl }]}>{error ?? `Nothing matches “${q.trim()}”. Try the company name.`}</Text>
      ) : null}
      <Pressable style={{ height: 1 }} />
    </Screen>
  );
}

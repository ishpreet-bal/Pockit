import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Card, EmptyCard, Loading, formatMoney, PreviewBadge, Screen, SectionHeader, StaleNote, useAccent } from '@/components/ui';
import { PREVIEW } from '@/lib/session';
import { useSummary, type Summary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';

/** Invest: what your investments are worth, what you own, and a short watchlist. */
export default function Invest() {
  const { data, error, refreshing, refresh } = useSummary();
  const c = useColors();
  return (
    <Screen section="invest" title="Invest (demo)" eyebrow="Still being built — follow along and learn" onRefresh={refresh} refreshing={refreshing} right={<SearchButton />}>
      {PREVIEW ? <PreviewBadge /> : null}
      <LearnCard />
      <StaleNote message={data ? error : null} />
      {data ? <Body d={data} /> : <Loading error={error} />}
    </Screen>
  );
}

function Line({ symbol, name, value, pct, last }: { symbol: string; name: string; value: string; pct: number | null; last: boolean }) {
  const c = useColors();
  const a = useAccent();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/stock/[symbol]', params: { symbol } })} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: c.border }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[type.caption, { color: a.accent, fontSize: 10 }]} numberOfLines={1}>{symbol.slice(0, 5)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, { color: c.text }]}>{symbol}</Text>
        <Text style={[type.footnote, { color: c.textMuted }]} numberOfLines={1}>{name}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[type.bodyStrong, { color: c.text }]}>{value}</Text>
        {pct !== null ? <Text style={[type.footnote, { color: pct >= 0 ? c.positive : c.negative }]}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% today</Text> : null}
      </View>
    </View>
    </Pressable>
  );
}

function Body({ d }: { d: Summary }) {
  const c = useColors();
  const inv = d.invest;
  return (
    <>
      {inv.holdings.length ? (
        <>
          <Text style={[type.subhead, { color: c.textMuted }]}>Your investments</Text>
          <Text style={[type.hero, { color: c.text, marginTop: 2 }]}>{formatMoney(inv.totalValueMinor, { cents: false })}</Text>
          {inv.gainPct !== null ? (
            <Text style={[type.footnote, { color: inv.gainMinor >= 0 ? c.positive : c.negative, marginTop: 4 }]}>
              {inv.gainMinor >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(inv.gainMinor), { cents: false })} ({Math.abs(inv.gainPct)}%) since you bought
            </Text>
          ) : null}
          <SectionHeader title="What you own" />
          <Card>
            {inv.holdings.map((h, i) => (
              <Line key={`${h.symbol}-${i}`} symbol={h.symbol} name={h.name} value={formatMoney(h.valueMinor, { cents: false })} pct={h.changePct} last={i === inv.holdings.length - 1} />
            ))}
          </Card>
        </>
      ) : (
        <>
          <EmptyCard title="Nothing invested yet" body="Search any stock or fund and tap Watch to follow it. What you own is added under Accounts." />
          <Card style={{ paddingVertical: space.lg, marginTop: 12, alignItems: 'center' }} onPress={() => router.push('/search')}>
            <Text style={[type.bodyStrong, { color: c.section.invest.accent }]}>Search stocks & funds</Text>
          </Card>
        </>
      )}

      {inv.watchlist.length ? (
        <>
          <SectionHeader title="Watching" />
          <Card>
            {inv.watchlist.map((w, i) => (
              <Line key={w.symbol} symbol={w.symbol} name={w.name} value={w.priceMinor !== null ? formatMoney(w.priceMinor) : '—'} pct={w.changePct} last={i === inv.watchlist.length - 1} />
            ))}
          </Card>
        </>
      ) : null}
      <Text style={[type.caption, { color: c.textSubtle, marginTop: space.lg, textAlign: 'center' }]}>Pockit helps you follow investments. It never buys or sells.</Text>
    </>
  );
}

function SearchButton() {
  const a = useAccent();
  return (
    <Pressable onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="Search stocks and funds" hitSlop={8}
      style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: a.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="magnifyingglass" size={19} color={a.accent} />
    </Pressable>
  );
}

/** Asks first — the lessons are only there if they're curious. */
function LearnCard() {
  const c = useColors();
  const a = useAccent();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <Card>
      <View style={{ paddingVertical: space.lg }}>
        <Text style={[type.headline, { color: c.text }]}>Want to learn about investing?</Text>
        <Text style={[type.subhead, { color: c.textMuted, marginTop: 4, lineHeight: 20 }]}>Stocks, ETFs, bonds, crypto — what they are, in plain words. Ask the tutor anything.</Text>
        <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.md }}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/learn')}><Text style={[type.bodyStrong, { color: a.accent }]}>Yes, show me</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setHidden(true)}><Text style={[type.bodyStrong, { color: c.textMuted }]}>Not now</Text></Pressable>
        </View>
      </View>
    </Card>
  );
}

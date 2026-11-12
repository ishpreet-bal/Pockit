import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useToolTint } from '@/theme/palette';
import { router, useFocusEffect } from 'expo-router';
import { getText, lessonsRead, setText } from '@/lib/prefs';
import { TOPICS, type Level } from './learn';
import { TourTarget } from '@/lib/tour';
import { Icon } from '@/components/Icon';
import { Card, Shortcuts, EmptyCard, Loading, formatMoney, PreviewBadge, Screen, SectionHeader, StaleNote, useAccent } from '@/components/ui';
import { PREVIEW } from '@/lib/session';
import { HomeButton, InvestingGate } from '@/components/InvestingGate';
import { Press } from '@/components/Press';
import { useSummary, type Summary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';

/**
 * Investing: its own section, opened from Settings. Still being finished, so only
 * the people who run Pockit (ADMIN_EMAILS) can open it; everyone else sees that it's
 * coming. A Home button at the top always leads back out.
 */
export default function Investing() {
  return <InvestingGate><Invest /></InvestingGate>;
}

/** Invest: what your investments are worth, what you own, and a short watchlist. */
function Invest() {
  const { data, error, refreshing, refresh } = useSummary();
  const c = useColors();
  // Unknown until they say. The demo shows the full tab straight away.
  const [level, setLevel] = useState<Level | null | undefined>(PREVIEW ? 'beginner' : undefined);
  const [done, setDone] = useState<string[]>([]);
  useFocusEffect(useCallback(() => {
    void lessonsRead().then(setDone);
    if (!PREVIEW) void getText('investLevel').then((v) => setLevel((v as Level | null) ?? null));
  }, []));
  const choose = (l: Level | null) => { setLevel(l); void setText('investLevel', l); };

  return (
    <Screen section="invest" title={PREVIEW ? 'Investing (demo)' : 'Investing'} eyebrow="Learn, follow and track" back onRefresh={refresh} refreshing={refreshing}
      right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{level ? <SearchButton /> : null}<HomeButton /></View>}>
      {PREVIEW ? <PreviewBadge /> : null}
      {level === undefined ? null : level === null ? <LevelPicker onPick={choose} /> : (
        <>
          {level !== 'advanced' ? <TourTarget id="learn"><Path level={level} done={done} /></TourTarget> : null}
          <StaleNote message={data ? error : null} />
          {level === 'beginner' && data && !data.invest.holdings.length && !PREVIEW ? (
            <Text style={[type.footnote, { color: c.textMuted, marginTop: space.xl, lineHeight: 20 }]}>When you’re ready, search any stock or fund above and tap Watch to follow it — no money involved.</Text>
          ) : null}
          {data ? <Body d={data} /> : <Loading error={error} />}
          <Pressable onPress={() => choose(null)} hitSlop={8} style={{ alignSelf: 'center', marginTop: space.xxl }} accessibilityRole="button">
            <Text style={[type.label, { color: c.textMuted }]}>Change my level</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

/** First visit: where are you with investing? Everything after is shaped by the answer. */
function LevelPicker({ onPick }: { onPick: (l: Level) => void }) {
  const c = useColors();
  const a = useAccent();
  const options: { level: Level; title: string; body: string }[] = [
    { level: 'beginner', title: 'Brand new', body: 'Start from zero — what stocks and ETFs are, and how people begin.' },
    { level: 'intermediate', title: 'I know the basics', body: 'Fees, picking a mix, which account first, investing regularly.' },
    { level: 'advanced', title: 'I’m experienced', body: 'Skip the lessons — just follow your stocks and funds.' },
  ];
  return (
    <View>
      <Text style={[type.title2, { color: c.text }]}>Where are you with investing?</Text>
      <Text style={[type.subhead, { color: c.textMuted, marginTop: 8, lineHeight: 22 }]}>Pick what fits and Pockit will meet you there. You can change it any time.</Text>
      <View style={{ marginTop: space.xl, gap: 10 }}>
        {options.map((o) => (
          <Pressable key={o.level} onPress={() => onPick(o.level)} accessibilityRole="button"
            style={({ pressed }) => ({ padding: space.lg, borderRadius: 10, borderWidth: 1, borderColor: pressed ? a.accent : c.border, backgroundColor: c.surface, opacity: pressed ? 0.85 : 1 })}>
            <Text style={[type.headline, { color: c.text }]}>{o.title}</Text>
            <Text style={[type.footnote, { color: c.textMuted, marginTop: 4, lineHeight: 20 }]}>{o.body}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[type.footnote, { color: c.textSubtle, marginTop: space.lg, lineHeight: 20 }]}>Pockit is for learning and following — it never buys or sells anything.</Text>
    </View>
  );
}

/** Your lessons, in order: how far along you are and the next one to read. */
function Path({ level, done }: { level: Level; done: string[] }) {
  const c = useColors();
  const a = useAccent();
  const lessons = TOPICS.filter((t) => t.level === level);
  const read = lessons.filter((t) => done.includes(t.id)).length;
  const next = lessons.find((t) => !done.includes(t.id));
  const tool = useToolTint();
  return (
    <View>
      <Text style={[type.label, { color: c.textMuted }]}>{level === 'beginner' ? 'Your first steps' : 'Going further'}</Text>
      <Text style={[type.hero, { color: c.text, marginTop: 6 }]}>{read}<Text style={{ color: c.textSubtle }}>/{lessons.length}</Text></Text>
      <Text style={[type.subhead, { color: c.textMuted }]}>{read === lessons.length ? 'All read — nice work.' : 'lessons read · about a minute each'}</Text>
      <View style={{ height: 3, backgroundColor: c.surface2, marginTop: space.md }}>
        <View style={{ height: 3, width: `${(read / lessons.length) * 100}%`, backgroundColor: a.accent }} />
      </View>
      {next ? (
        <Pressable onPress={() => router.push({ pathname: '/learn', params: { level, topic: next.id } })} accessibilityRole="button"
          style={({ pressed }) => ({ marginTop: space.xl, padding: space.lg, borderRadius: 10, backgroundColor: c.surface, borderWidth: 0.5, borderColor: c.border, opacity: pressed ? 0.75 : 1 })}>
          <Text style={[type.caption, { color: a.accent }]}>NEXT UP</Text>
          <Text style={[type.headline, { color: c.text, marginTop: 4 }]}>{next.title}</Text>
          <Text style={[type.footnote, { color: c.textMuted, marginTop: 2 }]}>{next.line}</Text>
        </Pressable>
      ) : null}
      <Shortcuts items={[
        { icon: 'book', label: 'All lessons', color: tool('lessons'), onPress: () => router.push({ pathname: '/learn', params: { level } }) },
        { icon: 'sparkles', label: 'Ask Pock', color: tool('ask'), onPress: () => router.push({ pathname: '/pock', params: { mode: 'learn' } }) },
        { icon: 'magnifyingglass', label: 'Look up', color: tool('lookup'), onPress: () => router.push('/search') },
      ]} />
    </View>
  );
}

function Line({ symbol, name, value, pct, last, note }: { symbol: string | null; name: string; value: string; pct: number | null; last: boolean; note?: string }) {
  const c = useColors();
  const a = useAccent();
  return (
    <Pressable disabled={!symbol} accessibilityRole={symbol ? 'button' : undefined} onPress={() => { if (symbol) router.push({ pathname: '/stock/[symbol]', params: { symbol } }); }} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: c.border }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[type.caption, { color: a.accent, fontSize: 10 }]} numberOfLines={1}>{(symbol ?? name).slice(0, 5)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, { color: c.text }]}>{symbol ?? name}</Text>
        <Text style={[type.footnote, { color: c.textMuted }]} numberOfLines={1}>{name}</Text>
        {note ? <Text style={[type.caption, { color: c.textMuted }]}>{note}</Text> : null}
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
  const totals = inv.totals ?? [{ currency: d.currency, valueMinor: inv.totalValueMinor, gainMinor: inv.gainMinor, gainPct: inv.gainPct, recordedCount: 0 }];
  return (
    <>
      <Card onPress={() => router.push('/holdings')} style={{ paddingVertical: space.md, marginTop: space.md, marginBottom: space.md }}><Text style={[type.bodyStrong, { color: c.section.invest.accent }]}>Manage holdings</Text></Card>
      {inv.holdings.length ? (
        <>
          <Text style={[type.subhead, { color: c.textMuted }]}>Your investments</Text>
          {totals.map((total) => <View key={total.currency} style={{ marginTop: space.sm }}>
            <Text style={[type.title2, { color: c.text }]}>{formatMoney(total.valueMinor, { cents: false, currency: total.currency })}</Text>
            {total.gainPct !== null ? <Text style={[type.footnote, { color: total.gainMinor >= 0 ? c.positive : c.negative, marginTop: 4 }]}>{total.gainMinor >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(total.gainMinor), { cents: false, currency: total.currency })} ({Math.abs(total.gainPct).toFixed(2)}%) against recorded cost</Text> : null}
            {total.recordedCount ? <Text style={[type.caption, { color: c.textMuted }]}>{total.recordedCount} at recorded value; live pricing unavailable or in another currency.</Text> : null}
          </View>)}
          {totals.length > 1 ? <Text style={[type.footnote, { color: c.textMuted, marginTop: space.sm }]}>Currencies are shown separately. No exchange rate has been applied.</Text> : null}
          <SectionHeader title="What you own" />
          <Card>
            {inv.holdings.map((h, i) => (
              <Line key={h.id ?? `${h.symbol}-${i}`} symbol={h.symbol} name={h.name} value={formatMoney(h.valueMinor, { cents: false, currency: h.currency ?? d.currency })} pct={h.changePct} note={h.valuation === 'recorded' ? `Recorded value${h.asOf ? ` · ${h.asOf.slice(0, 10)}` : ''}` : h.source} last={i === inv.holdings.length - 1} />
            ))}
          </Card>
        </>
      ) : (
        <>
          <EmptyCard title="Nothing invested yet" body="Search any stock or fund and tap Watch to follow it, or use Manage holdings to record what you own." />
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
              <Line key={w.symbol} symbol={w.symbol} name={w.name} value={w.priceMinor !== null ? formatMoney(w.priceMinor, { currency: w.currency ?? d.currency }) : 'Unavailable'} pct={w.changePct} note={w.simulated ? 'Sample price' : w.source ? `${w.source}${w.asOf ? ` · ${w.asOf.slice(0, 10)}` : ''}` : undefined} last={i === inv.watchlist.length - 1} />
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

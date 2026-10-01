import { useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { Button, Field, FormError, toMinor } from '@/components/form';
import { api } from '@/lib/api';
import { router } from 'expo-router';
import { Card, EmptyCard, Loading, formatMoney, friendlyDate, PreviewBadge, Row, Screen, SectionHeader, StaleNote, useAccent } from '@/components/ui';
import { LineChart } from '@/components/LineChart';
import { PockButton, PockMark } from '@/components/Pock';
import { useSession, PREVIEW } from '@/lib/session';
import { useSummary, type Summary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';

/** Home: how much can I spend, what's coming up, and a glance at goals and investments. */
export default function Home() {
  const { me } = useSession();
  const { data, error, refreshing, refresh } = useSummary();
  const first = me?.name?.split(' ')[0];
  return (
    <Screen section="home" title={first ? `Hi ${first}` : 'Hi there'} right={<PockButton onPress={() => router.push('/pock')} />} onRefresh={refresh} refreshing={refreshing}>
      {PREVIEW ? <PreviewBadge /> : null}
      <StaleNote message={data ? error : null} />
      {data ? <Body d={data} /> : <Loading error={error} />}
    </Screen>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function tip(d: Summary): string {
  if (!d.hasBalance) return 'Add what’s in your everyday account below and Pockit works out what’s safe to spend.';
  if (d.home.short) return 'Bills due this month are more than the cash you have. Hold off on extras until payday.';
  const bill = d.home.upcoming[0];
  if (bill && d.home.safeToSpendMinor > bill.amountMinor) return `${bill.name} is covered. You’re in good shape until payday.`;
  if (!d.hasData) return 'Add a bill or a purchase and this screen starts working for you.';
  return 'You’re on track this month.';
}

function Body({ d }: { d: Summary }) {
  const c = useColors();
  const a = useAccent();
  const { width } = useWindowDimensions();
  const h = d.home;
  const goal = d.goals.find((g) => !g.achieved) ?? null;
  const pct = goal && goal.targetMinor > 0 ? Math.round((goal.currentMinor / goal.targetMinor) * 100) : null;
  const showTrend = h.trend.some((m) => m.netMinor !== 0);

  return (
    <>
      <Text style={[type.subhead, { color: c.textMuted }]}>{h.short ? 'Short of upcoming bills' : 'You can spend'}</Text>
      <Text style={[type.hero, { color: h.short ? c.negative : c.text, marginTop: 2 }]}>{formatMoney(Math.abs(h.safeToSpendMinor), { cents: false })}</Text>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: 4, lineHeight: 18 }]}>
        {h.nextIncome ? `until payday on ${friendlyDate(h.nextIncome.date, d.today)} · after bills` : h.explanation}
      </Text>

      {showTrend ? (
        <View style={{ marginHorizontal: -space.xl, marginTop: space.lg }}>
          <LineChart
            values={h.trend.map((m) => m.netMinor)}
            labels={h.trend.map((m) => `Saved in ${MONTHS[Number(m.month.slice(5)) - 1]}`)}
            width={width}
            height={80}
            format={(v) => formatMoney(v, { cents: false, signed: true })}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: a.soft, borderRadius: 14, padding: 12, marginTop: space.lg }}>
        <PockMark color={a.accent} size={22} />
        <Text style={[type.footnote, { color: c.text, flex: 1, lineHeight: 18 }]}>{tip(d)}</Text>
      </View>

      {!d.hasBalance && !PREVIEW ? <BalanceCard /> : null}

      <SectionHeader title="Coming up" action="All bills" onAction={() => router.push('/bills')} />
      {h.upcoming.length ? (
        <Card>
          {h.upcoming.map((b, i) => (
            <Row key={`${b.name}-${b.date}`} icon="calendar" title={b.name} detail={friendlyDate(b.date, d.today)} value={formatMoney(b.amountMinor, { cents: false })} last={i === h.upcoming.length - 1} />
          ))}
        </Card>
      ) : (
        <EmptyCard title="No bills yet" body="Add rent, your phone or subscriptions and they’ll show up here before they’re due." />
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: space.xl }}>
        <Card style={{ flex: 1, padding: space.lg }} onPress={() => router.push('/goals')}>
          <Text style={[type.caption, { color: c.section.goals.accent }]}>GOAL</Text>
          {goal ? (
            <>
              <Text style={[type.bodyStrong, { color: c.text, marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>{goal.name}</Text>
              <View style={{ height: 6, borderRadius: 6, backgroundColor: c.surface2, marginTop: 10 }}>
                <View style={{ width: `${Math.min(1, goal.currentMinor / Math.max(1, goal.targetMinor)) * 100}%`, height: 6, borderRadius: 6, backgroundColor: c.section.goals.accent }} />
              </View>
              <Text style={[type.footnote, { color: c.textMuted, marginTop: 8 }]}>{pct === null ? 'Add an amount' : `${pct}% saved`}</Text>
            </>
          ) : <Text style={[type.footnote, { color: c.textMuted, marginTop: 6 }]}>Set a goal and watch it fill up.</Text>}
        </Card>
        <Card style={{ flex: 1, padding: space.lg }} onPress={() => router.push('/invest')}>
          <Text style={[type.caption, { color: c.section.invest.accent }]}>INVESTED</Text>
          {d.invest.holdings.length ? (
            <>
              <Text style={[type.bodyStrong, { color: c.text, marginTop: 4 }]}>{formatMoney(d.invest.totalValueMinor, { cents: false })}</Text>
              {d.invest.gainPct !== null ? (
                <Text style={[type.footnote, { color: d.invest.gainMinor >= 0 ? c.positive : c.negative, marginTop: 24 }]}>
                  {d.invest.gainMinor >= 0 ? '▲' : '▼'} {Math.abs(d.invest.gainPct)}% overall
                </Text>
              ) : null}
            </>
          ) : <Text style={[type.footnote, { color: c.textMuted, marginTop: 6 }]}>Follow stocks and funds you’re curious about.</Text>}
        </Card>
      </View>
    </>
  );
}

/**
 * Shown until there's a balance to work from. Without one, "safe to spend" can
 * only ever say $0 — so ask, right where the $0 is.
 */
function BalanceCard() {
  const c = useColors();
  const a = useAccent();
  const { refresh } = useSummary();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try { await api('/api/mobile/balance', { body: { amount: toMinor(amount)! / 100 } }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'That could not be saved.'); }
    finally { setBusy(false); }
  }
  return (
    <Card style={{ padding: space.lg, gap: space.md, marginTop: space.lg, borderColor: a.accent, borderWidth: 1 }}>
      <Text style={[type.headline, { color: c.text }]}>What’s in your everyday account?</Text>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: -6, lineHeight: 18 }]}>Pockit works out what’s safe to spend from this, after your bills.</Text>
      <Field label="Balance right now" prefix="$" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="1,500" />
      <FormError message={error} />
      <Button label="Save" loading={busy} disabled={toMinor(amount) === null} onPress={save} />
    </Card>
  );
}

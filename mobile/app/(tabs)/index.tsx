import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Field, FormError, toMinor } from '@/components/form';
import { api } from '@/lib/api';
import { router } from 'expo-router';
import { Card, Loading, formatMoney, PreviewBadge, Row, Screen, SectionHeader, StaleNote, useAccent } from '@/components/ui';
import { PockButton } from '@/components/Pock';
import { useSession, PREVIEW } from '@/lib/session';
import { useSummary, type Summary } from '@/lib/summary';
import { font, space, type, useColors } from '@/theme/tokens';

/** Home: how much can I spend, what's coming up, and a glance at goals and investments. */
// Once per app launch at most, so dismissing it never brings it straight back.
let tourOffered = false;

export default function Home() {
  const { me, demo } = useSession();
  // The walkthrough opens by itself the first time: after setup, or when someone
  // starts the demo. Skipping it counts as seeing it.
  useEffect(() => {
    if (tourOffered || !me) return;
    if (demo || me.tourDone === false) {
      tourOffered = true;
      const t = setTimeout(() => router.push('/tour'), 600);
      return () => clearTimeout(t);
    }
  }, [me, demo]);
  const { data, error, refreshing, refresh } = useSummary();
  const first = me?.name?.split(' ')[0];
  return (
    <Screen section="home" title={data ? todayLine(data.today) : 'Pockit'} eyebrow={first ? `Hi ${first}` : undefined} right={<PockButton onPress={() => router.push('/pock')} />} onRefresh={refresh} refreshing={refreshing}>
      {PREVIEW ? <PreviewBadge /> : null}
      <StaleNote message={data ? error : null} />
      {data ? <Body d={data} /> : <Loading error={error} />}
    </Screen>
  );
}

function tip(d: Summary): string {
  if (!d.hasBalance) return 'Add what’s in your everyday account and Pockit works out what’s safe to spend.';
  if (d.home.short) return 'Bills before payday are more than the cash you have. Hold off on extras until then.';
  const bill = d.home.upcoming[0];
  if (bill && d.home.safeToSpendMinor > bill.amountMinor) return `${bill.name} is covered. You’re in good shape until payday.`;
  if (!d.hasData) return 'Add a bill or a purchase and this screen starts working for you.';
  return 'You’re on track this month.';
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const stamp = (iso: string) => `${MON[at(iso).getUTCMonth()]} ${String(at(iso).getUTCDate()).padStart(2, '0')}`;
export const todayLine = (iso: string) => `${DAYS[at(iso).getUTCDay()]} ${String(at(iso).getUTCDate()).padStart(2, '0')} ${MON[at(iso).getUTCMonth()]}`;
const daysBetween = (a: string, b: string) => Math.round((at(b).getTime() - at(a).getTime()) / 86_400_000);

interface Stop { key: string; date: string; label: string; title: string; after: number; amount: number | null; kind: 'now' | 'bill' | 'pay' }

/**
 * The runway: from today down to payday, one stop per bill, with what you'll
 * have left after each. It ends on what's safe to spend — the big number.
 */
function runway(d: Summary): Stop[] {
  const h = d.home;
  const pay = h.nextIncome;
  const bills = h.upcoming.filter((b) => !pay || b.date <= pay.date);
  const owed = bills.reduce((t, b) => t + b.amountMinor, 0);
  let bal = h.safeToSpendMinor + owed;
  const stops: Stop[] = [{ key: 'now', date: d.today, label: 'TODAY', title: 'You are here', after: bal, amount: null, kind: 'now' }];
  for (const b of bills) {
    bal -= b.amountMinor;
    stops.push({ key: `${b.name}-${b.date}`, date: b.date, label: b.date === d.today ? 'TODAY' : stamp(b.date), title: b.name, after: bal, amount: -b.amountMinor, kind: 'bill' });
  }
  if (pay) stops.push({ key: 'pay', date: pay.date, label: stamp(pay.date), title: pay.name || 'Payday', after: bal + pay.amountMinor, amount: pay.amountMinor, kind: 'pay' });
  return stops;
}

function Body({ d }: { d: Summary }) {
  const c = useColors();
  const a = useAccent();
  const h = d.home;
  const days = h.nextIncome ? Math.max(1, daysBetween(d.today, h.nextIncome.date)) : null;
  const goal = d.goals.find((g) => !g.achieved) ?? null;
  const stops = runway(d);

  return (
    <>
      <Text style={[type.hero, { color: h.short ? c.negative : a.accent }]} accessibilityLabel={`${h.short ? 'Short by' : 'Safe to spend'} ${formatMoney(Math.abs(h.safeToSpendMinor), { cents: false })}`}>
        {h.short ? '−' : ''}{formatMoney(Math.abs(h.safeToSpendMinor), { cents: false })}
      </Text>
      <Text style={[type.subhead, { color: c.textMuted, marginTop: 4 }]}>
        {h.short ? 'short of your bills before payday' : days ? `runway to payday · ${days} day${days === 1 ? '' : 's'} · ${formatMoney(Math.max(0, h.safeToSpendMinor) / days, { cents: false })}/day` : 'safe to spend after your bills'}
      </Text>

      {!d.hasBalance && !PREVIEW ? <BalanceCard /> : null}

      <View style={{ marginTop: 34 }}>
        {stops.map((st, i) => (
          <StopRow key={st.key} stop={st} first={i === 0} last={i === stops.length - 1} onPress={st.kind === 'bill' ? () => router.push('/bills') : undefined} />
        ))}
      </View>
      {!h.nextIncome ? (
        <Text style={[type.footnote, { color: c.textMuted, marginTop: space.md, lineHeight: 20 }]}>
          Add your pay under Bills & income and this becomes a countdown to payday.
        </Text>
      ) : null}
      {stops.length === 2 && h.nextIncome ? (
        <Text style={[type.footnote, { color: c.textMuted, marginTop: space.sm }]}>Nothing due before payday.</Text>
      ) : null}

      <Text style={{ fontFamily: font.italic, fontSize: 17, lineHeight: 24, color: c.textMuted, marginTop: 30, borderLeftWidth: 2, borderLeftColor: a.accent, paddingLeft: 12 }}>
        {tip(d)}
      </Text>

      <SectionHeader title="Also" />
      <Card>
        <Row icon="" title={goal ? goal.name : 'Goals'} detail={goal ? (goal.targetMinor ? `${Math.round((goal.currentMinor / goal.targetMinor) * 100)}% saved` : 'Add an amount') : 'Set one and watch it fill'}
          value={goal ? formatMoney(goal.currentMinor, { cents: false }) : '›'} valueColor={goal ? c.text : c.textSubtle} onPress={() => router.push('/goals')} />
        <Row icon="" title="Invested" detail={d.invest.gainPct !== null && d.invest.holdings.length ? `${d.invest.gainMinor >= 0 ? '+' : '−'}${Math.abs(d.invest.gainPct)}% overall` : 'Follow stocks and funds'}
          value={d.invest.holdings.length ? formatMoney(d.invest.totalValueMinor, { cents: false }) : '›'} valueColor={d.invest.holdings.length ? c.text : c.textSubtle} last onPress={() => router.push('/invest')} />
      </Card>
    </>
  );
}

function StopRow({ stop, first, last, onPress }: { stop: Stop; first: boolean; last: boolean; onPress?: () => void }) {
  const c = useColors();
  const a = useAccent();
  const dot = stop.kind === 'now'
    ? { backgroundColor: a.accent, borderColor: a.accent }
    : stop.kind === 'pay' ? { backgroundColor: c.text, borderColor: c.text } : { backgroundColor: c.bg, borderColor: a.accent };
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', minHeight: stop.kind === 'now' ? 92 : 74, opacity: pressed ? 0.6 : 1 })}>
      <Text style={[type.caption, { width: 54, color: stop.kind === 'now' ? c.text : c.textMuted, textAlign: 'right', paddingTop: 2 }]}>{stop.label}</Text>
      <View style={{ width: 40, alignItems: 'center' }}>
        <View style={{ position: 'absolute', top: first ? 9 : 0, bottom: last ? undefined : 0, height: last ? 9 : undefined, width: 2, backgroundColor: a.accent, opacity: stop.kind === 'pay' ? 0.35 : 0.8 }} />
        {stop.kind === 'now' ? <View style={{ position: 'absolute', top: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: a.soft }} /> : null}
        <View style={[{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 2 }, dot]} />
      </View>
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={[type.body, { color: c.text }]} numberOfLines={1}>{stop.title}</Text>
          <Text style={[type.caption, { color: c.textMuted, marginTop: 4 }]}>{stop.kind === 'now' ? 'BAL ' : '→ '}{formatMoney(stop.after, { cents: false })}</Text>
        </View>
        {stop.amount !== null ? (
          <Text style={[type.subhead, { color: stop.amount > 0 ? a.accent : c.negative, fontVariant: ['tabular-nums'] }]}>
            {stop.amount > 0 ? '+' : '−'}{formatMoney(Math.abs(stop.amount)).replace('$', '')}
          </Text>
        ) : null}
      </View>
    </Pressable>
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
    <Card style={{ paddingVertical: space.lg, gap: space.md, marginTop: space.xl, borderColor: a.accent }}>
      <Text style={[type.headline, { color: c.text }]}>What’s in your everyday account?</Text>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: -6, lineHeight: 18 }]}>Pockit works out what’s safe to spend from this, after your bills.</Text>
      <Field label="Balance right now" prefix="$" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="1,500" />
      <FormError message={error} />
      <Button label="Save" loading={busy} disabled={toMinor(amount) === null} onPress={save} />
    </Card>
  );
}

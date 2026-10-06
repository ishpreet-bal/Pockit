import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Field, FormError, toMinor } from '@/components/form';
import { api } from '@/lib/api';
import { router } from 'expo-router';
import { Card, Loading, formatMoney, PreviewBadge, Row, Screen, SectionHeader, Shortcuts, StaleNote, useAccent } from '@/components/ui';
import { PockMark } from '@/components/Pock';
import { Icon } from '@/components/Icon';
import { TourTarget, useTour } from '@/lib/tour';
import { useSession, PREVIEW } from '@/lib/session';
import { useSummary, type Summary } from '@/lib/summary';
import { font, space, type, useColors } from '@/theme/tokens';

/** Home: how much can I spend, what's coming up, and a glance at goals and investments. */
// Once per app launch at most, so dismissing it never brings it straight back.
let tourOffered = false;

export default function Home() {
  const { me, demo } = useSession();
  const tour = useTour();
  // The walkthrough opens by itself the first time: after setup, or when someone
  // starts the demo. Skipping it counts as seeing it.
  useEffect(() => {
    if (tourOffered || !me) return;
    if (demo || me.tourDone === false) {
      tourOffered = true;
      const t = setTimeout(() => tour.offer(), 900);
      return () => clearTimeout(t);
    }
  }, [me, demo]);
  const { data, error, refreshing, refresh } = useSummary();
  const first = me?.name?.split(' ')[0];
  return (
    <Screen section="home" title={data ? todayLine(data.today) : 'Pockit'} eyebrow={first ? `Hi ${first}` : undefined} right={<ProfileButton />} onRefresh={refresh} refreshing={refreshing}>
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
      <TourTarget id="hero">
      <Text style={[type.hero, { color: h.short ? c.negative : a.accent }]} accessibilityLabel={`${h.short ? 'Short by' : 'Safe to spend'} ${formatMoney(Math.abs(h.safeToSpendMinor), { cents: false })}`}>
        {h.short ? '−' : ''}{formatMoney(Math.abs(h.safeToSpendMinor), { cents: false })}
      </Text>
      <Text style={[type.subhead, { color: c.textMuted, marginTop: 4 }]}>
        {h.short ? 'short of your bills before payday' : days ? `safe to spend · ${days} day${days === 1 ? '' : 's'} to payday · ${formatMoney(Math.max(0, h.safeToSpendMinor) / days, { cents: false })}/day` : 'safe to spend after your bills'}
      </Text>
      </TourTarget>

      <TourTarget id="shortcuts">
        <Shortcuts items={[
          { icon: 'plus', label: 'Add', onPress: () => router.push('/add') },
          { icon: 'calendar', label: 'Bills', onPress: () => router.push('/bills') },
          { icon: 'chart.bar', label: 'Budget', onPress: () => router.push('/budget') },
          { icon: 'car', label: 'Trip', onPress: () => router.push('/trip') },
        ]} />
      </TourTarget>

      {d.bank?.available && !d.bank.connected && !PREVIEW ? <ConnectBankCard /> : !d.hasBalance && !PREVIEW ? <BalanceCard /> : null}

      <SectionHeader title="To payday" action="All bills" onAction={() => router.push('/bills')} />
      <TourTarget id="runway">
        {stops.map((st, i) => (
          <StopRow key={st.key} stop={st} first={i === 0} last={i === stops.length - 1} onPress={st.kind === 'bill' ? () => router.push('/bills') : undefined} />
        ))}
      </TourTarget>
      {!h.nextIncome ? (
        <Text style={[type.footnote, { color: c.textMuted, marginTop: space.md, lineHeight: 20 }]}>
          Add your pay under Bills & income and this becomes a countdown to payday.
        </Text>
      ) : null}
      {stops.length === 2 && h.nextIncome ? (
        <Text style={[type.footnote, { color: c.textMuted, marginTop: space.sm }]}>Nothing due before payday.</Text>
      ) : null}

      <TourTarget id="pockNote">
        <Pressable onPress={() => router.navigate('/ask')} accessibilityRole="button" accessibilityLabel="Ask Pock"
          style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 28, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.surface, borderWidth: 0.5, borderColor: c.border, opacity: pressed ? 0.7 : 1 })}>
          <PockMark size={20} color={a.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.serifItalic, fontSize: 17, lineHeight: 22, color: c.text }}>{tip(d)}</Text>
            <Text style={[type.caption, { color: a.accent, marginTop: 8 }]}>ASK POCK →</Text>
          </View>
        </Pressable>
      </TourTarget>

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
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', minHeight: stop.kind === 'now' ? 62 : 54, opacity: pressed ? 0.6 : 1 })}>
      <Text style={[type.caption, { fontSize: 11, width: 54, color: stop.kind === 'now' ? c.text : c.textMuted, textAlign: 'right', paddingTop: 2 }]}>{stop.label}</Text>
      <View style={{ width: 40, alignItems: 'center' }}>
        <View style={{ position: 'absolute', top: first ? 9 : 0, bottom: last ? undefined : 0, height: last ? 9 : undefined, width: 2, backgroundColor: a.accent, opacity: stop.kind === 'pay' ? 0.35 : 0.8 }} />
        {stop.kind === 'now' ? <View style={{ position: 'absolute', top: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: a.soft }} /> : null}
        <View style={[{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 2 }, dot]} />
      </View>
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={[type.subhead, { color: c.text }]} numberOfLines={1}>{stop.title}</Text>
          <Text style={[type.caption, { fontSize: 11, color: c.textMuted, marginTop: 2 }]}>{stop.kind === 'now' ? 'BAL ' : '→ '}{formatMoney(stop.after, { cents: false })}</Text>
        </View>
        {stop.amount !== null ? (
          <Text style={[type.footnote, { color: stop.amount > 0 ? a.accent : c.negative, fontVariant: ['tabular-nums'] }]}>
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

/** You — settings, accounts and the rest live behind your profile, like any app. */
function ProfileButton() {
  const c = useColors();
  return (
    <Pressable onPress={() => router.push('/more')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Profile and settings"
      style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.6 : 1 })}>
      <Icon name="person.crop.circle" size={20} color={c.textMuted} />
    </Pressable>
  );
}

/** The easiest way to keep Pockit right: let the bank fill it in. */
function ConnectBankCard() {
  const c = useColors();
  const a = useAccent();
  return (
    <Pressable onPress={() => router.push('/accounts')} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: space.xl, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: a.accent, opacity: pressed ? 0.7 : 1 })}>
      <Icon name="building.columns" size={20} color={a.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[type.headline, { color: c.text }]}>Connect your bank</Text>
        <Text style={[type.footnote, { color: c.textMuted, marginTop: 2 }]}>Transactions and balances add themselves. Secure, read-only.</Text>
      </View>
      <Icon name="chevron.right" size={14} color={c.textSubtle} />
    </Pressable>
  );
}

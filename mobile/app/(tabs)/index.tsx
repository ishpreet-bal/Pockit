import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Field, FormError, toMinor } from '@/components/form';
import { api } from '@/lib/api';
import { soft, useToolTint } from '@/theme/palette';
import { router } from 'expo-router';
import { Card, Loading, formatMoney, PreviewBadge, Row, Screen, SectionHeader, Shortcuts, StaleNote, useAccent } from '@/components/ui';
import { PockMark } from '@/components/Pock';
import { Icon } from '@/components/Icon';
import { TourTarget, useTour } from '@/lib/tour';
import { GuestBanner, SampleDataBanner } from '@/components/GuestBanner';
import { useSession, PREVIEW } from '@/lib/session';
import { pendingBank, resumeClaimed } from '@/lib/bank';
import { useSummary, type Summary } from '@/lib/summary';
import { font, radius, space, type, useColors, useIsDark } from '@/theme/tokens';

/** Home: how much can I spend, what's coming up, and a glance at goals and investments. */
// Once per app launch at most, so dismissing it never brings it straight back.
let tourOffered = false;

export default function Home() {
  const { me, demo } = useSession();
  const tour = useTour();
  const { data, error, refreshing, refresh } = useSummary();
  // The walkthrough opens by itself the first time: after setup, or when someone
  // starts the demo. Skipping it counts as seeing it. It waits for the page to have
  // its numbers, so it never talks over a loading screen.
  useEffect(() => {
    if (tourOffered || !me || !data) return;
    if (demo || me.tourDone === false) {
      tourOffered = true;
      const t = setTimeout(() => tour.offer(), 900);
      return () => clearTimeout(t);
    }
  }, [me, demo, data]);
  // A bank connection was started and Pockit reloaded while they were at the bank
  // (phones do this): go back to Accounts, which finishes it.
  useEffect(() => {
    if (!me || me.guest || !pendingBank()) return;
    // If Accounts is already open (it was the page that reloaded), it takes it from here.
    const t = setTimeout(() => { if (!resumeClaimed()) router.push('/accounts'); }, 500);
    return () => clearTimeout(t);
  }, [me]);
  const first = me?.name?.split(' ')[0];
  return (
    <Screen section="home" title={data ? todayLine(data.today) : 'Pockit'} eyebrow={data?.space?.shared ? `${data.space.name} · shared` : first ? `Hi ${first}` : undefined} right={<ProfileButton />} onRefresh={refresh} refreshing={refreshing}>
      {PREVIEW ? <PreviewBadge /> : null}
      <GuestBanner />
      <SampleDataBanner onCleared={refresh} />
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

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const stamp = (iso: string) => `${MON[at(iso).getUTCMonth()]![0]}${MON[at(iso).getUTCMonth()]!.slice(1).toLowerCase()} ${at(iso).getUTCDate()}`;
export const todayLine = (iso: string) => `${DAYS_LONG[at(iso).getUTCDay()]}, ${stamp(iso)}`;
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const daysBetween = (a: string, b: string) => Math.round((at(b).getTime() - at(a).getTime()) / 86_400_000);

function Body({ d }: { d: Summary }) {
  const c = useColors();
  const me = useSession().me;
  const guest = Boolean(me?.guest);
  const admin = Boolean(me?.admin);
  const a = useAccent();
  const h = d.home;
  const days = h.nextIncome ? Math.max(1, daysBetween(d.today, h.nextIncome.date)) : null;
  const goal = d.goals.find((g) => !g.achieved) ?? null;
  const tool = useToolTint();

  return (
    <>
      <TourTarget id="hero">
      <Text style={[type.hero, { color: h.short ? c.negative : a.accent }]} accessibilityLabel={`${h.short ? 'Short by' : 'Safe to spend'} ${formatMoney(Math.abs(h.safeToSpendMinor), { cents: false })}`}>
        {h.short ? '−' : ''}{formatMoney(Math.abs(h.safeToSpendMinor), { cents: false })}
      </Text>
      <Text style={[type.subhead, { color: c.textMuted, marginTop: 4 }]}>
        {h.short ? 'short of your bills before payday' : days ? 'safe to spend until payday' : 'safe to spend after your bills'}
      </Text>
      </TourTarget>

      <TourTarget id="shortcuts">
        <Shortcuts items={[
          { icon: 'plus', label: 'Add', color: tool('add'), onPress: () => router.push('/add') },
          { icon: 'calendar', label: 'Bills', color: tool('bills'), onPress: () => router.push('/bills') },
          { icon: 'chart.bar', label: 'Budget', color: tool('budget'), onPress: () => router.push('/budget') },
          { icon: 'car', label: 'Trip', color: tool('trip'), onPress: () => router.push('/trip') },
        ]} />
      </TourTarget>

      {d.bank?.available && !d.bank.connected && !PREVIEW && !guest ? <ConnectBankCard /> : !d.hasBalance && !PREVIEW ? <BalanceCard /> : null}

      <TourTarget id="runway">
        <PaydayCard d={d} />
      </TourTarget>

      <TourTarget id="pockNote" style={{ marginTop: 28 }}>
        <Pressable onPress={() => router.navigate('/ask')} accessibilityRole="button" accessibilityLabel="Ask Pock"
          style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.surface, borderWidth: 0.5, borderColor: c.border, opacity: pressed ? 0.7 : 1 })}>
          <PockMark size={20} color={a.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.serifItalic, fontSize: 17, lineHeight: 22, color: c.text }}>{tip(d)}</Text>
            <Text style={[type.caption, { color: a.accent, marginTop: 8 }]}>Ask Pock →</Text>
          </View>
        </Pressable>
      </TourTarget>

      <SectionHeader title="Also" />
      <Card>
        {d.owed && d.owed.minor > 0 ? (
          <Row icon="" title="Owed to you" detail={`From ${d.owed.count} split${d.owed.count === 1 ? '' : 's'} · tap when it comes back`}
            value={formatMoney(d.owed.minor, { cents: false })} valueColor={a.accent} onPress={() => router.push('/friends')} />
        ) : null}
        <Row icon="" title={goal ? goal.name : 'Goals'} detail={goal ? (goal.targetMinor ? `${Math.round((goal.currentMinor / goal.targetMinor) * 100)}% saved` : 'Add an amount') : 'Set one and watch it fill'}
          value={goal ? formatMoney(goal.currentMinor, { cents: false }) : '›'} valueColor={goal ? c.text : c.textSubtle} last={!admin} onPress={() => router.push('/goals')} />
        {admin ? <Row icon="" title="Invested" detail={d.invest.gainPct !== null && d.invest.holdings.length ? `${d.invest.gainMinor >= 0 ? '+' : '−'}${Math.abs(d.invest.gainPct)}% overall` : 'Follow stocks and funds'}
          value={d.invest.holdings.length ? formatMoney(d.invest.totalValueMinor, { cents: false }) : '›'} valueColor={d.invest.holdings.length ? c.text : c.textSubtle} last onPress={() => router.push('/investing')} /> : null}
      </Card>
    </>
  );
}

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

/**
 * The countdown to payday, in one card: how many days, what's safe per day, how
 * much of your money is free versus already spoken for, and only the bills and
 * card payments that fall before the next pay. After payday is another story.
 */
function PaydayCard({ d }: { d: Summary }) {
  const c = useColors();
  const a = useAccent();
  const dark = useIsDark();
  const h = d.home;
  const pay = h.nextIncome;
  const days = pay ? Math.max(0, daysBetween(d.today, pay.date)) : null;
  // The same window the safe-to-spend figure uses: up to (not including) payday,
  // or the rest of the month when no pay is known yet.
  const horizon: string = pay?.date ?? d.spending.periodEnd ?? d.today;
  const inWindow = (date: string) => (pay ? date < horizon : date <= horizon);
  const bills = h.upcoming.filter((b) => inWindow(b.date)).map((b) => ({ key: `${b.name}-${b.date}`, name: b.name, date: b.date, minor: b.amountMinor, card: false }));
  const cards = (h.cards ?? []).filter((x) => !x.paid);
  const cardsBefore = cards.filter((x) => inWindow(x.dueDate)).map((x) => ({ key: `card-${x.id}`, name: `${x.name} due`, date: x.dueDate, minor: x.statementMinor ?? x.minimumMinor ?? 0, card: true }));
  const cardsAfter = cards.filter((x) => !inWindow(x.dueDate));
  const items = [...bills, ...cardsBefore].sort((p, q) => p.date.localeCompare(q.date));
  const shown = items.slice(0, 4);
  const billsMinor = bills.reduce((t, b) => t + b.minor, 0);
  const free = Math.max(0, h.safeToSpendMinor);
  const whole = free + billsMinor;
  const perDay = days ? free / days : null;

  return (
    <View style={{ marginTop: space.xl, padding: space.lg, borderRadius: radius.tile, backgroundColor: c.surface, borderWidth: 0.5, borderColor: c.border, gap: space.md }}>
      <View>
        <Text style={[type.headline, { color: c.text }]}>
          {!pay ? 'Until the end of the month' : days === 0 ? 'Payday is today' : `${days} day${days === 1 ? '' : 's'} to payday · ${stamp(pay.date)}`}
        </Text>
        <Text style={[type.subhead, { color: h.short ? c.negative : c.textMuted, marginTop: 2 }]}>
          {h.short ? `Bills before payday are ${formatMoney(Math.abs(h.safeToSpendMinor), { cents: false })} more than you have` : perDay !== null ? `${formatMoney(perDay, { cents: false })} a day is safe` : `${formatMoney(free, { cents: false })} is safe to spend`}
        </Text>
      </View>

      {whole > 0 ? (
        <View accessibilityLabel={`${formatMoney(free, { cents: false })} free, ${formatMoney(billsMinor, { cents: false })} set aside for bills`}>
          <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: c.surface2 }}>
            <View style={{ flex: free, backgroundColor: a.accent }} />
            {billsMinor ? <View style={{ flex: billsMinor, backgroundColor: soft(a.accent, dark), marginLeft: free ? 2 : 0 }} /> : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={[type.footnote, { color: c.text, fontWeight: '600' }]}>{formatMoney(free, { cents: false })} free</Text>
            {billsMinor ? <Text style={[type.footnote, { color: c.textMuted }]}>{formatMoney(billsMinor, { cents: false })} for bills</Text> : null}
          </View>
        </View>
      ) : null}

      <View>
        <Text style={[type.caption, { color: c.textSubtle, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }]}>{pay ? 'Before payday' : 'Still to pay this month'}</Text>
        {shown.length ? shown.map((it, i) => (
          <Pressable key={it.key} onPress={() => router.push(it.card ? '/accounts' : '/bills')} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: i ? 0.5 : 0, borderTopColor: c.border, opacity: pressed ? 0.6 : 1 })}>
            <Text style={[type.footnote, { color: c.textMuted, width: 52 }]}>{it.date === d.today ? 'Today' : stamp(it.date)}</Text>
            <Text style={[type.body, { color: c.text, flex: 1 }]} numberOfLines={1}>{it.name}</Text>
            <Text style={[type.body, { color: it.card ? c.textMuted : c.text, fontVariant: ['tabular-nums'] }]}>{formatMoney(it.minor)}</Text>
          </Pressable>
        )) : <Text style={[type.footnote, { color: c.textMuted, paddingVertical: 6 }]}>{pay ? 'Nothing due before payday.' : 'Nothing else due this month.'}</Text>}
        {items.length > shown.length ? (
          <Pressable onPress={() => router.push('/bills')} hitSlop={8} accessibilityRole="button" style={{ marginTop: 4 }}>
            <Text style={[type.footnote, { color: a.accent, fontWeight: '600' }]}>{items.length - shown.length} more before payday</Text>
          </Pressable>
        ) : null}
        {cardsBefore.length ? <Text style={[type.caption, { color: c.textSubtle, marginTop: 4 }]}>Card payments are already set aside in what's safe to spend.</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: space.md }}>
        {pay ? (
          <Text style={[type.footnote, { color: c.text, flex: 1 }]}>Then <Text style={{ color: c.positive, fontWeight: '700' }}>+{formatMoney(pay.amountMinor, { cents: false })}</Text> {pay.name ? `from ${pay.name}` : 'pay'}</Text>
        ) : (
          <Pressable onPress={() => router.push('/bills')} accessibilityRole="button" style={{ flex: 1 }}>
            <Text style={[type.footnote, { color: a.accent, fontWeight: '600' }]}>Add your pay to count down to payday</Text>
          </Pressable>
        )}
        <Pressable onPress={() => router.push('/bills')} hitSlop={8} accessibilityRole="button">
          <Text style={[type.footnote, { color: a.accent, fontWeight: '600' }]}>See all ›</Text>
        </Pressable>
      </View>

      {cardsAfter.length ? (
        <Pressable onPress={() => router.push('/accounts')} accessibilityRole="button">
          <Text style={[type.caption, { color: c.textMuted, lineHeight: 18 }]}>
            After payday: {cardsAfter.map((x) => `${x.name} due ${stamp(x.dueDate)}${x.statementMinor ? ` (${formatMoney(x.statementMinor)})` : ''}`).join(' · ')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

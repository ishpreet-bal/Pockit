import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { Button, Chip, ChipRow, Field, FormError, StepScreen, toMinor } from '@/components/form';
import { PockMark } from '@/components/Pock';
import { Icon } from '@/components/Icon';
import { Card, formatMoney, Row } from '@/components/ui';
import { askForNotifications } from '@/lib/reminders';
import { setPref } from '@/lib/prefs';
import * as Haptics from 'expo-haptics';
import { api } from '@/lib/api';
import { PREVIEW, useSession } from '@/lib/session';
import { font, radius, space, type, useColors } from '@/theme/tokens';

/**
 * First-run setup, one question per screen. It opens with who you are and why you're
 * here (tap to answer, like a conversation), then the few numbers that make Pockit
 * yours: pay, bills, where money goes, what you have, what you're saving for. Each
 * answer is saved as soon as it is given, so closing the app halfway loses nothing,
 * and every question can be skipped: a skipped answer is "not set yet", never zero.
 */

const INTENTS = [
  { value: 'payday', icon: 'calendar', title: 'Stop running short before payday', detail: 'Know what’s safe to spend each day' },
  { value: 'save', icon: 'target', title: 'Save for something', detail: 'A trip, a car, a cushion for later' },
  { value: 'debt', icon: 'creditcard', title: 'Pay off debt', detail: 'Credit cards, loans, a line of credit' },
  { value: 'track', icon: 'chart.bar', title: 'See where my money goes', detail: 'Spending by category, without spreadsheets' },
  { value: 'together', icon: 'person.2', title: 'Budget with someone', detail: 'A partner, roommates or family' },
  { value: 'invest', icon: 'chart.line.uptrend.xyaxis', title: 'Learn to invest', detail: 'From the basics, at your pace' },
] as const;
type Intent = (typeof INTENTS)[number]['value'];

const HOUSEHOLDS = [
  { value: 'solo', icon: 'person.crop.circle', title: 'Just me', detail: 'My own money' },
  { value: 'partner', icon: 'person.2', title: 'Me and a partner', detail: 'Some or all of it is shared' },
  { value: 'family', icon: 'house', title: 'My family', detail: 'A household with kids or relatives' },
] as const;
type Household = (typeof HOUSEHOLDS)[number]['value'];

/** Top-level categories, by the slug every new workspace's categories use. */
const SPEND = [
  { slug: 'food', label: 'Groceries & eating out', hint: '600' },
  { slug: 'transportation', label: 'Gas, transit & car', hint: '250' },
  { slug: 'shopping', label: 'Shopping', hint: '200' },
  { slug: 'entertainment', label: 'Fun & going out', hint: '150' },
  { slug: 'health', label: 'Health & fitness', hint: '80' },
  { slug: 'travel', label: 'Travel', hint: '100' },
  { slug: 'gifts-giving', label: 'Gifts & giving', hint: '50' },
  { slug: 'education', label: 'School & learning', hint: '100' },
] as const;

const CADENCES = [
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Monthly' },
] as const;
type Cadence = (typeof CADENCES)[number]['value'];

const GOALS = [
  { kind: 'emergency_fund', label: 'Emergency fund' },
  { kind: 'vacation', label: 'Travel' },
  { kind: 'debt_payoff', label: 'Pay off debt' },
  { kind: 'car', label: 'A car' },
  { kind: 'house', label: 'A home' },
  { kind: 'investment', label: 'Invest' },
  { kind: 'tuition', label: 'Education' },
  { kind: 'general', label: 'Something else' },
];

const BILL_SUGGESTIONS = ['Rent', 'Phone', 'Internet', 'Car payment', 'Insurance', 'Streaming'];

type Step = 'intro' | 'why' | 'who' | 'income' | 'bills' | 'spending' | 'savings' | 'goals' | 'alerts' | 'summary';
const QUESTIONS: Step[] = ['why', 'who', 'income', 'bills', 'spending', 'savings', 'goals', 'alerts'];

interface Bill { name: string; amount: string; day: string }
interface Picture { monthlyIncomeMinor: number | null; monthlyCommitmentsMinor: number | null; flexibleMinor: number | null; savingsMinor: number | null; goalCount: number }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The next date on which this day of the month falls (the 31st becomes the month's last day). */
function nextOnDay(day: number): string {
  const now = new Date();
  for (let add = 0; add < 2; add++) {
    const y = now.getFullYear(), m = now.getMonth() + add;
    const last = new Date(y, m + 1, 0).getDate();
    const d = new Date(y, m, Math.min(day, last));
    if (d >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) return iso(d);
  }
  return iso(now);
}

function toMonthly(minor: number, cadence: Cadence) {
  return cadence === 'weekly' ? Math.round((minor * 52) / 12) : cadence === 'biweekly' ? Math.round((minor * 26) / 12) : cadence === 'semimonthly' ? minor * 2 : minor;
}

export default function Setup() {
  const c = useColors();
  const { me, refresh } = useSession();
  const [step, setStep] = useState<Step>('intro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [income, setIncome] = useState('');
  const [cadence, setCadence] = useState<Cadence>('biweekly');
  const [payday, setPayday] = useState<string | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [savings, setSavings] = useState('');
  const [chequing, setChequing] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [household, setHousehold] = useState<Household | null>(null);
  const [spend, setSpend] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const [picture, setPicture] = useState<Picture | null>(null);

  const name = me?.name ?? '';
  const index = QUESTIONS.indexOf(step);

  /** Save this screen's answer, then move on. Offline in preview: just move on. */
  async function save(answers: Record<string, unknown>, next: Step) {
    setBusy(true); setError(null);
    try {
      if (!PREVIEW) await api('/api/onboarding/state', { method: 'PATCH', body: { stage: 'financial_setup_started', answers } });
      setStep(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved.');
    } finally { setBusy(false); }
  }

  function skip(what: string, next: Step) {
    const list = [...skipped, what];
    setSkipped(list);
    void save({ skipped: list }, next);
  }

  async function finish() {
    setBusy(true); setError(null);
    try {
      if (PREVIEW) {
        const inc = toMinor(income);
        const monthlyIncome = inc === null ? null : toMonthly(inc, cadence);
        const commitments = bills.length ? bills.reduce((s, b) => s + (toMinor(b.amount) ?? 0), 0) : null;
        setPicture({ monthlyIncomeMinor: monthlyIncome, monthlyCommitmentsMinor: commitments, flexibleMinor: monthlyIncome === null ? null : monthlyIncome - (commitments ?? 0), savingsMinor: toMinor(savings), goalCount: goals.length });
      } else {
        await api('/api/onboarding/state', {
          method: 'PATCH',
          body: { stage: 'financial_setup_completed', answers: { goals: goals.map((kind) => ({ kind, name: GOALS.find((g) => g.kind === kind)?.label ?? kind })), intents, ...(household ? { household } : {}) } },
        });
        const res = await api<{ picture: Picture }>('/api/onboarding/apply', { method: 'POST' });
        setPicture(res.picture);
      }
      setStep('summary');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved.');
    } finally { setBusy(false); }
  }

  const progress = index >= 0 ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" onPress={() => setStep(index === 0 ? 'intro' : QUESTIONS[index - 1]!)}>
        <Icon name="chevron.left" size={22} color={c.section.home.accent} />
      </Pressable>
      <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
        {QUESTIONS.map((q, i) => (
          <View key={q} style={{ flex: 1, height: 4, borderRadius: 4, backgroundColor: i <= index ? c.section.home.accent : c.surface2 }} />
        ))}
      </View>
      <Text style={[type.caption, { color: c.textMuted }]}>{index + 1} of {QUESTIONS.length}</Text>
    </View>
  ) : undefined;

  const skipButton = (what: string, next: Step, label = 'Skip for now') => (
    <Button label={label} variant="plain" onPress={() => skip(what, next)} />
  );

  let screen;
  switch (step) {
    case 'intro':
      screen = (
        <StepScreen
          title={name ? `Let’s set up your Pockit, ${name}.` : 'Let’s set up your Pockit.'}
          subtitle="A few quick questions, about two minutes, so what you see is really yours. Tap to answer, and skip anything you’re not sure about."
          footer={<>
            <Button label="Let’s go" onPress={() => setStep('why')} />
            <Button label="Skip setup for now" variant="plain" onPress={async () => { if (!PREVIEW) await api('/api/onboarding/apply', { method: 'POST' }).catch(() => null); await refresh(); router.replace('/'); }} />
          </>}
        >
          <View style={{ backgroundColor: c.section.home.soft, borderRadius: radius.card, padding: space.xl, gap: space.md }}>
            {['What you want from Pockit', 'How you get paid, and your bills', 'Where your money goes', 'What you’re saving for'].map((t, i) => (
              <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: font.semibold, fontSize: 13, color: c.section.home.accent }}>{i + 1}</Text>
                </View>
                <Text style={[type.body, { color: c.text }]}>{t}</Text>
              </View>
            ))}
          </View>
        </StepScreen>
      );
      break;

    case 'why':
      screen = (
        <StepScreen
          top={progress}
          title="What brings you to Pockit?"
          subtitle="Pick everything that fits. It shapes what Pockit shows you first."
          footer={<>
            <Button label="Continue" loading={busy} disabled={intents.length === 0} onPress={() => save({ intents }, 'who')} />
            {skipButton('intents', 'who')}
          </>}
        >
          <View style={{ gap: space.sm }}>
            {INTENTS.map((o) => (
              <Choice key={o.value} icon={o.icon} title={o.title} detail={o.detail} selected={intents.includes(o.value)} multi
                onPress={() => setIntents(intents.includes(o.value) ? intents.filter((x) => x !== o.value) : [...intents, o.value])} />
            ))}
          </View>
          <FormError message={error} />
        </StepScreen>
      );
      break;

    case 'who':
      screen = (
        <StepScreen
          top={progress}
          title="Who are you budgeting for?"
          subtitle="Shared money can live in a shared space, and you can keep your own space private."
          footer={<>
            <Button label="Continue" loading={busy} disabled={!household} onPress={() => save({ household: household! }, 'income')} />
            {skipButton('household', 'income')}
          </>}
        >
          <View style={{ gap: space.sm }}>
            {HOUSEHOLDS.map((o) => (
              <Choice key={o.value} icon={o.icon} title={o.title} detail={o.detail} selected={household === o.value} onPress={() => setHousehold(o.value)} />
            ))}
          </View>
          <FormError message={error} />
        </StepScreen>
      );
      break;

    case 'spending': {
      const picked = SPEND.filter((s) => spend[s.slug] !== undefined);
      const answers: Record<string, number> = {};
      for (const s of picked) { const m = toMinor(spend[s.slug] ?? ''); if (m !== null && m > 0) answers[s.slug] = m; }
      const total = Object.values(answers).reduce((t, v) => t + v, 0);
      screen = (
        <StepScreen
          top={progress}
          title="Where does most of your money go?"
          subtitle="Tap a few and guess a monthly amount. This becomes your first budget, and you can change it any time."
          footer={<>
            <Button label="Continue" loading={busy} disabled={Object.keys(answers).length === 0} onPress={() => save({ spendingByCategory: answers }, 'savings')} />
            {skipButton('spending', 'savings', 'I’ll set a budget later')}
          </>}
        >
          <ChipRow>
            {SPEND.map((s) => (
              <Chip key={s.slug} label={s.label} selected={spend[s.slug] !== undefined}
                onPress={() => { const next = { ...spend }; if (next[s.slug] !== undefined) delete next[s.slug]; else next[s.slug] = ''; setSpend(next); }} />
            ))}
          </ChipRow>
          {picked.map((s) => (
            <Field key={s.slug} label={`${s.label}, each month`} prefix="$" value={spend[s.slug] ?? ''} onChangeText={(t) => setSpend({ ...spend, [s.slug]: t })} keyboardType="decimal-pad" placeholder={s.hint} />
          ))}
          {total > 0 ? <Text style={[type.footnote, { color: c.textMuted }]}>About {formatMoney(total, { cents: false })} a month on these.</Text> : null}
          <FormError message={error} />
        </StepScreen>
      );
      break;
    }

    case 'alerts':
      screen = (
        <StepScreen
          top={progress}
          title="Want a heads-up before bills are due?"
          subtitle="A reminder at 9am the day before each bill, and a nudge when a budget gets close. Nothing else, and you can turn it off in Settings."
          footer={<>
            <Button label="Yes, remind me" loading={busy} onPress={async () => {
              if (!PREVIEW && (await askForNotifications())) { await setPref('billReminders', true); await setPref('budgetAlerts', true); }
              void finish();
            }} />
            <Button label="Not now" variant="plain" onPress={() => void finish()} />
          </>}
        >
          <View style={{ backgroundColor: c.section.home.soft, borderRadius: radius.card, padding: space.xl, gap: 6 }}>
            <Text style={[type.bodyStrong, { color: c.text }]}>Tomorrow: Rent, $1,650</Text>
            <Text style={[type.footnote, { color: c.textMuted }]}>You’ll have about $412 left until payday on Friday.</Text>
          </View>
          <FormError message={error} />
        </StepScreen>
      );
      break;

    case 'income': {
      const minor = toMinor(income);
      const days = Array.from({ length: 21 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
      screen = (
        <StepScreen
          top={progress}
          title="How much do you get paid?"
          subtitle="After tax — what actually lands in your account."
          footer={<>
            <Button label="Continue" loading={busy} disabled={minor === null || !payday} onPress={() => save({ incomeMinor: minor!, incomeCadence: cadence, incomeNextDate: payday! }, 'bills')} />
            {skipButton('income', 'bills')}
          </>}
        >
          <Field label="Each paycheque" prefix="$" value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder="2,400" autoFocus />
          <ChipRow>{CADENCES.map((o) => <Chip key={o.value} label={o.label} selected={cadence === o.value} onPress={() => setCadence(o.value)} />)}</ChipRow>
          {minor !== null ? <Text style={[type.footnote, { color: c.textMuted }]}>That’s about {formatMoney(toMonthly(minor, cadence), { cents: false })} a month.</Text> : null}
          <View>
            <Text style={[type.footnote, { color: c.textMuted, marginBottom: 8 }]}>When’s your next payday?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {days.map((d) => {
                const v = iso(d), on = payday === v;
                return (
                  <Pressable key={v} onPress={() => setPayday(v)} accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={{ width: 58, paddingVertical: 10, borderRadius: 14, alignItems: 'center', backgroundColor: on ? c.section.home.accent : c.surface, borderWidth: 1.5, borderColor: on ? c.section.home.accent : c.border }}>
                    <Text style={{ fontFamily: font.medium, fontSize: 11, color: on ? c.bg : c.textMuted }}>{d.toLocaleDateString('en-CA', { weekday: 'short' })}</Text>
                    <Text style={{ fontFamily: font.bold, fontSize: 20, color: on ? c.bg : c.text, marginTop: 2 }}>{d.getDate()}</Text>
                    <Text style={{ fontFamily: font.medium, fontSize: 11, color: on ? c.bg : c.textMuted }}>{d.toLocaleDateString('en-CA', { month: 'short' })}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <FormError message={error} />
        </StepScreen>
      );
      break;
    }

    case 'bills': {
      const valid = bills.filter((b) => b.name.trim() && toMinor(b.amount) !== null);
      const update = (i: number, patch: Partial<Bill>) => setBills(bills.map((b, j) => (j === i ? { ...b, ...patch } : b)));
      screen = (
        <StepScreen
          top={progress}
          title="What bills come every month?"
          subtitle="Rent, phone, subscriptions — the things that leave no matter what."
          footer={<>
            <Button label="Continue" loading={busy} disabled={valid.length === 0} onPress={() => save({
              recurring: valid.map((b) => ({ name: b.name.trim(), amountMinor: toMinor(b.amount)!, cadence: 'monthly', nextDate: nextOnDay(Math.max(1, Math.min(31, Number(b.day) || 1))) })),
            }, 'spending')} />
            {skipButton('recurring', 'spending', 'I’ll add these later')}
          </>}
        >
          <ChipRow>
            {BILL_SUGGESTIONS.filter((s) => !bills.some((b) => b.name === s)).map((s) => (
              <Chip key={s} label={`+ ${s}`} selected={false} onPress={() => setBills([...bills, { name: s, amount: '', day: '1' }])} />
            ))}
            <Chip label="+ Other" selected={false} onPress={() => setBills([...bills, { name: '', amount: '', day: '1' }])} />
          </ChipRow>
          {bills.map((b, i) => (
            <View key={i} style={{ backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border, padding: space.lg, gap: space.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[type.headline, { color: c.text }]}>{b.name || 'New bill'}</Text>
                <Pressable onPress={() => setBills(bills.filter((_, j) => j !== i))} hitSlop={10} accessibilityLabel={`Remove ${b.name || 'bill'}`}>
                  <Text style={[type.footnote, { color: c.textMuted }]}>Remove</Text>
                </Pressable>
              </View>
              {!BILL_SUGGESTIONS.includes(b.name) ? <Field label="Name" value={b.name} onChangeText={(t) => update(i, { name: t })} placeholder="Gym" /> : null}
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <View style={{ flex: 3 }}><Field label="Amount" prefix="$" value={b.amount} onChangeText={(t) => update(i, { amount: t })} keyboardType="decimal-pad" placeholder="0" /></View>
                <View style={{ flex: 2 }}><Field label="Due on the" value={b.day} onChangeText={(t) => update(i, { day: t.replace(/\D/g, '').slice(0, 2) })} keyboardType="number-pad" placeholder="1" /></View>
              </View>
            </View>
          ))}
          <FormError message={error} />
        </StepScreen>
      );
      break;
    }

    case 'savings': {
      const chq = toMinor(chequing);
      const sav = toMinor(savings);
      // Either is enough to go on; whatever's left blank stays "not set yet", not zero.
      const answers: Record<string, number> = {};
      if (chq !== null) answers.chequingMinor = chq;
      if (sav !== null) answers.savingsMinor = sav;
      screen = (
        <StepScreen
          top={progress}
          title="How much do you have right now?"
          subtitle="Rough numbers are fine — check your banking app if you like. This is what “safe to spend” starts from."
          footer={<>
            <Button label="Continue" loading={busy} disabled={chq === null && sav === null} onPress={() => save(answers, 'goals')} />
            {skipButton('savings', 'goals', 'I’ll add this later')}
          </>}
        >
          <Field label="In your everyday (chequing) account" prefix="$" value={chequing} onChangeText={setChequing} keyboardType="decimal-pad" placeholder="1,500" autoFocus />
          <Field label="In savings (optional)" prefix="$" value={savings} onChangeText={setSavings} keyboardType="decimal-pad" placeholder="3,000" />
          <FormError message={error} />
        </StepScreen>
      );
      break;
    }

    case 'goals':
      screen = (
        <StepScreen
          top={progress}
          title="What are you saving for?"
          subtitle="Pick as many as you like. You can add amounts and dates later."
          footer={<>
            <Button label="Continue" loading={busy} disabled={goals.length === 0} onPress={() => save({ goals: goals.map((kind) => ({ kind, name: GOALS.find((g) => g.kind === kind)?.label ?? kind })) }, 'alerts')} />
            <Button label="Not right now" variant="plain" onPress={() => skip('goals', 'alerts')} />
          </>}
        >
          <ChipRow>
            {GOALS.map((g) => (
              <Chip key={g.kind} label={g.label} selected={goals.includes(g.kind)} onPress={() => setGoals(goals.includes(g.kind) ? goals.filter((k) => k !== g.kind) : [...goals, g.kind])} />
            ))}
          </ChipRow>
          <FormError message={error} />
        </StepScreen>
      );
      break;

    case 'summary': {
      const p = picture;
      // What to do first, from what they said they want.
      const nextSteps: { title: string; detail: string; href: string }[] = [];
      if (household === 'partner' || household === 'family' || intents.includes('together')) nextSteps.push({ title: household === 'family' ? 'Invite your family' : 'Invite your partner', detail: 'A shared space for the money you share', href: '/spaces' });
      if (intents.includes('track')) nextSteps.push({ title: 'Connect your bank', detail: 'Purchases arrive on their own', href: '/accounts' });
      if (intents.includes('debt')) nextSteps.push({ title: 'Plan your debt payoff', detail: 'A goal with a date to be debt-free', href: '/new-goal' });
      if (intents.includes('invest')) nextSteps.push({ title: 'Start learning to invest', detail: 'Short lessons, at your level', href: '/learn' });
      if (intents.includes('save') && !(p && p.goalCount > 0)) nextSteps.push({ title: 'Set a savings goal', detail: 'Pockit works out how much a month', href: '/new-goal' });
      const line = (label: string, value: number | null, tone?: string) => (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: c.border }}>
          <Text style={[type.body, { color: c.textMuted }]}>{label}</Text>
          <Text style={[type.bodyStrong, { color: value === null ? c.textSubtle : tone ?? c.text }]}>{value === null ? 'Not set yet' : formatMoney(value, { cents: false })}</Text>
        </View>
      );
      screen = (
        <StepScreen
          title="You’re all set."
          subtitle="Here’s your starting point. It gets sharper as you use Pockit."
          footer={<Button label="See my Pockit" loading={busy} onPress={async () => { await refresh(); router.replace('/'); }} />}
        >
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.section.home.soft, alignItems: 'center', justifyContent: 'center' }}>
            <PockMark size={34} color={c.section.home.accent} />
          </View>
          <View>
            {line('Coming in each month', p?.monthlyIncomeMinor ?? null)}
            {line('Bills each month', p?.monthlyCommitmentsMinor ?? null)}
            {line('Left for everything else', p?.flexibleMinor ?? null, c.positive)}
            {line('Savings', p?.savingsMinor ?? null)}
          </View>
          {p && p.goalCount > 0 ? <Text style={[type.footnote, { color: c.textMuted }]}>{p.goalCount} {p.goalCount === 1 ? 'goal' : 'goals'} added — you’ll find {p.goalCount === 1 ? 'it' : 'them'} in Goals.</Text> : null}
          {nextSteps.length ? (
            <View style={{ gap: space.sm }}>
              <Text style={[type.label, { color: c.textMuted }]}>Good next steps for you</Text>
              <Card>
                {nextSteps.map((n, i) => (
                  <Row key={n.title} icon="" title={n.title} detail={n.detail} value="›" valueColor={c.textSubtle} last={i === nextSteps.length - 1}
                    onPress={async () => { await refresh(); router.replace('/'); setTimeout(() => router.push(n.href as never), 50); }} />
                ))}
              </Card>
            </View>
          ) : null}
        </StepScreen>
      );
      break;
    }
  }

  return (
    <Animated.View key={step} entering={FadeInRight.duration(320)} style={{ flex: 1, backgroundColor: c.bg }}>
      {screen}
    </Animated.View>
  );
}

/** A big tappable answer, like a card in a conversation. */
function Choice({ icon, title, detail, selected, onPress, multi = false }: { icon: string; title: string; detail: string; selected: boolean; onPress: () => void; multi?: boolean }) {
  const c = useColors();
  const a = c.section.home;
  return (
    <Pressable onPress={() => { void Haptics.selectionAsync(); onPress(); }} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.card, borderWidth: 1.5, borderColor: selected ? a.accent : c.border, backgroundColor: selected ? a.soft : c.surface, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: selected ? c.surface : a.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={a.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, { color: c.text }]}>{title}</Text>
        <Text style={[type.footnote, { color: c.textMuted, marginTop: 2 }]}>{detail}</Text>
      </View>
      <View style={{ width: 22, height: 22, borderRadius: multi ? 6 : 11, borderWidth: 2, borderColor: selected ? a.accent : c.border, backgroundColor: selected ? a.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {selected ? <Icon name="checkmark" size={13} color="#ffffff" /> : null}
      </View>
    </Pressable>
  );
}

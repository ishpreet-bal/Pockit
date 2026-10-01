import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { Button, Chip, ChipRow, Field, FormError, StepScreen, toMinor } from '@/components/form';
import { PockMark } from '@/components/Pock';
import { Icon } from '@/components/Icon';
import { formatMoney } from '@/components/ui';
import { api } from '@/lib/api';
import { PREVIEW, useSession } from '@/lib/session';
import { font, radius, space, type, useColors } from '@/theme/tokens';

/**
 * First-run setup: four short questions, one per screen, each saved as soon as it is
 * answered so closing the app halfway loses nothing. Every question can be skipped;
 * a skipped answer is "not set yet", never zero.
 */

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

type Step = 'intro' | 'income' | 'bills' | 'savings' | 'goals' | 'summary';
const QUESTIONS: Step[] = ['income', 'bills', 'savings', 'goals'];

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
          body: { stage: 'financial_setup_completed', answers: { goals: goals.map((kind) => ({ kind, name: GOALS.find((g) => g.kind === kind)?.label ?? kind })) } },
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
      <Text style={[type.caption, { color: c.textMuted }]}>{index + 1} of 4</Text>
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
          subtitle="Four quick questions about your money, so the numbers you see are really yours. Skip anything you’re not sure about."
          footer={<>
            <Button label="Let’s go" onPress={() => setStep('income')} />
            <Button label="Skip setup for now" variant="plain" onPress={async () => { if (!PREVIEW) await api('/api/onboarding/apply', { method: 'POST' }).catch(() => null); await refresh(); router.replace('/'); }} />
          </>}
        >
          <View style={{ backgroundColor: c.section.home.soft, borderRadius: radius.card, padding: space.xl, gap: space.md }}>
            {['What you earn', 'Bills you pay every month', 'What you have right now', 'What you’re saving for'].map((t, i) => (
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
            }, 'savings')} />
            {skipButton('recurring', 'savings', 'I’ll add these later')}
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
            <Button label="Finish" loading={busy} disabled={goals.length === 0} onPress={finish} />
            <Button label="Not right now" variant="plain" onPress={() => { setSkipped([...skipped, 'goals']); void finish(); }} />
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

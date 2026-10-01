import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Button, Chip, ChipRow } from '@/components/form';
import { Icon } from '@/components/Icon';
import { PockMark } from '@/components/Pock';
import { api } from '@/lib/api';
import { PREVIEW, useSession } from '@/lib/session';
import { font, radius, space, type, useColors, type Section } from '@/theme/tokens';

/**
 * The walkthrough.
 *
 * It starts by asking what the person wants from Pockit, then shows each part of
 * the app in a sentence or two — what it's for and how to use it — and ends by
 * offering to do the first useful thing for them, picked from what they said.
 * Skip is on every card; nothing here is required.
 */

type Want = 'payday' | 'save' | 'bills' | 'invest' | 'track';

const WANTS: { id: Want; label: string }[] = [
  { id: 'payday', label: 'Stop running short before payday' },
  { id: 'bills', label: 'Never miss a bill' },
  { id: 'save', label: 'Save for something' },
  { id: 'track', label: 'See where my money goes' },
  { id: 'invest', label: 'Learn about investing' },
];

interface Stop { section: Section; icon: string; title: string; what: string; how: string; for: Want[] }

const STOPS: Stop[] = [
  {
    section: 'home', icon: 'house.fill', title: 'Home: what you can spend',
    what: 'The big number is what’s safe to spend until payday — your money, minus the bills that are still coming.',
    how: 'Check it before you buy something. If it’s green, you’re fine.',
    for: ['payday', 'bills', 'track'],
  },
  {
    section: 'spending', icon: 'arrow.left.arrow.right', title: 'Spending: where it went',
    what: 'Every purchase this month, sorted into groceries, eating out and so on.',
    how: 'Tap + to add one in a few seconds. Tap Budget to set a plan for each category.',
    for: ['track', 'payday'],
  },
  {
    section: 'goals', icon: 'target', title: 'Goals: what you’re saving for',
    what: 'A trip, a car, an emergency fund — each goal shows how far along you are.',
    how: 'Pockit works out how much to put aside each month. Tap a goal to add money to it.',
    for: ['save'],
  },
  {
    section: 'invest', icon: 'chart.line.uptrend.xyaxis', title: 'Invest: learn and follow',
    what: 'Look up any stock or fund and follow it. There’s a gentle guide if you’re new to investing.',
    how: 'Pockit never buys or sells anything — it’s a safe place to learn.',
    for: ['invest'],
  },
  {
    section: 'home', icon: 'bubble.left', title: 'Pock: ask anything',
    what: 'Pock can see your numbers and answers in plain words.',
    how: 'Tap the P in the top corner and ask things like “Can I afford a $200 concert this month?”',
    for: ['payday', 'save', 'bills', 'track', 'invest'],
  },
];

const FIRST_STEPS: { for: Want; label: string; go: () => void }[] = [
  { for: 'bills', label: 'Add a bill', go: () => router.replace('/bills') },
  { for: 'payday', label: 'Add a bill', go: () => router.replace('/bills') },
  { for: 'save', label: 'Set a goal', go: () => router.replace('/new-goal') },
  { for: 'track', label: 'Add a purchase', go: () => router.replace('/add') },
  { for: 'invest', label: 'Learn about investing', go: () => router.replace('/learn') },
];

export default function Tour() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { me, refresh } = useSession();
  const [step, setStep] = useState(0);
  const [wants, setWants] = useState<Want[]>([]);

  // Their picks come first, so the tour leads with what they care about.
  const stops = [...STOPS].sort((a, b) => Number(b.for.some((w) => wants.includes(w))) - Number(a.for.some((w) => wants.includes(w))));
  const total = stops.length + 2; // the question, the stops, the finish
  const first = me?.name?.split(' ')[0];

  async function finish(then?: () => void) {
    if (!PREVIEW) {
      try { await api('/api/onboarding/state', { method: 'PATCH', body: { tourCompleted: true } }); await refresh(); } catch { /* worst case it's offered again */ }
    }
    if (then) then(); else router.back();
  }

  const next = () => { void Haptics.selectionAsync(); setStep((s) => s + 1); };
  const firstSteps = FIRST_STEPS.filter((f) => wants.includes(f.for)).filter((f, i, all) => all.findIndex((x) => x.label === f.label) === i);

  let body;
  if (step === 0) {
    body = (
      <>
        <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: c.section.home.soft, alignItems: 'center', justifyContent: 'center' }}>
          <PockMark size={46} color={c.section.home.accent} />
        </View>
        <Text style={[type.largeTitle, { color: c.text, marginTop: space.xl }]}>{first ? `Welcome in, ${first}.` : 'Welcome in.'}</Text>
        <Text style={[type.body, { color: c.textMuted, marginTop: space.md, lineHeight: 23 }]}>
          Want a quick look around? It takes about a minute, and you can skip any time.
        </Text>
        <Text style={[type.headline, { color: c.text, marginTop: space.xxl }]}>What brings you to Pockit?</Text>
        <Text style={[type.footnote, { color: c.textMuted, marginTop: 4, marginBottom: space.md }]}>Pick any that fit — I’ll show you those parts first.</Text>
        <ChipRow>
          {WANTS.map((w) => (
            <Chip key={w.id} label={w.label} selected={wants.includes(w.id)} onPress={() => setWants(wants.includes(w.id) ? wants.filter((x) => x !== w.id) : [...wants, w.id])} />
          ))}
        </ChipRow>
      </>
    );
  } else if (step <= stops.length) {
    const stop = stops[step - 1]!;
    const a = c.section[stop.section];
    const forYou = stop.for.some((w) => wants.includes(w));
    body = (
      <>
        <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={stop.icon} size={32} color={a.accent} />
        </View>
        {forYou ? <Text style={[type.caption, { color: a.accent, marginTop: space.lg }]}>BECAUSE YOU SAID IT MATTERS</Text> : null}
        <Text style={[type.title2, { color: c.text, marginTop: forYou ? 6 : space.xl }]}>{stop.title}</Text>
        <Text style={[type.body, { color: c.text, marginTop: space.md, lineHeight: 24 }]}>{stop.what}</Text>
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: a.soft, borderRadius: radius.card, padding: space.lg, marginTop: space.xl }}>
          <Text style={{ fontFamily: font.semibold, color: a.accent }}>How</Text>
          <Text style={[type.subhead, { color: c.text, flex: 1, lineHeight: 21 }]}>{stop.how}</Text>
        </View>
      </>
    );
  } else {
    body = (
      <>
        <Text style={[type.largeTitle, { color: c.text }]}>That’s Pockit.</Text>
        <Text style={[type.body, { color: c.textMuted, marginTop: space.md, lineHeight: 23 }]}>
          {firstSteps.length ? 'Want to start with one of these?' : 'You’re all set. You can replay this tour any time from More.'}
        </Text>
        <View style={{ gap: space.sm, marginTop: space.xl }}>
          {firstSteps.map((f) => <Button key={f.label} label={f.label} variant="secondary" onPress={() => void finish(f.go)} />)}
        </View>
      </>
    );
  }

  const last = step === total - 1;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: insets.top + space.md, paddingHorizontal: space.xl }}>
        {step > 0 ? (
          <Pressable onPress={() => setStep(step - 1)} hitSlop={12} accessibilityLabel="Back"><Icon name="chevron.left" size={22} color={c.section.home.accent} /></Pressable>
        ) : <View style={{ width: 22 }} />}
        <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 4, backgroundColor: i <= step ? c.section.home.accent : c.surface2 }} />
          ))}
        </View>
        {!last ? (
          <Pressable onPress={() => void finish()} hitSlop={12} accessibilityRole="button"><Text style={[type.bodyStrong, { color: c.textMuted }]}>Skip</Text></Pressable>
        ) : <View style={{ width: 30 }} />}
      </View>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.xxl }}>
        <Animated.View key={step} entering={FadeInRight.duration(280)}>{body}</Animated.View>
      </ScrollView>
      <View style={{ paddingHorizontal: space.xl, paddingBottom: Math.max(insets.bottom, space.lg) }}>
        <Button label={step === 0 ? 'Show me around' : last ? 'Start using Pockit' : 'Next'} onPress={last ? () => void finish() : next} />
      </View>
    </View>
  );
}

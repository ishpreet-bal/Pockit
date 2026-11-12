import { TourTarget } from '@/lib/tour';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { PockMark } from '@/components/Pock';
import { Icon } from '@/components/Icon';
import { api, ApiError } from '@/lib/api';
import { PREVIEW, useSession } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { AiConsentCard, needsAiConsent } from '@/components/AiConsent';
import { font, radius, space, type, useColors, useIsDark } from '@/theme/tokens';

/** Something Pock offers to do. Nothing happens until it's tapped (server: /api/pock/act). */
interface Action { id: string; kind: string; title: string; detail: string | null; confirm: string; params: Record<string, unknown>; state?: 'busy' | 'done' | 'skipped' | 'error'; note?: string }
interface Msg { role: 'user' | 'pock' | 'problem'; text: string; upgrade?: boolean; question?: string; reported?: boolean; actions?: Action[] }

const STARTERS = [
  'How much can I spend this week?',
  'Where did most of my money go this month?',
  'I just spent $14 at Tim Hortons',
  'Keep my eating out under $200 a month',
];

/**
 * Ask Pock: a plain conversation about your own money. Answers come from the server,
 * which grounds them in this account's real numbers. Opened from a goal, the goal
 * travels along as the subject so "can I finish this sooner?" needs no explaining.
 */
export default function Pock({ embedded = false }: { embedded?: boolean }) {
  const c = useColors();
  const a = c.section.home;
  const insets = useSafeAreaInsets();
  // Dark mode's accent is light, so text on it goes dark.
  const onAccent = useIsDark() ? c.bg : '#fff';
  const params = useLocalSearchParams<{ goalId?: string; goalName?: string; mode?: string; q?: string }>();
  const learn = params.mode === 'learn';
  const anchor = params.goalId ? { kind: 'goal' as const, id: params.goalId, label: params.goalName } : undefined;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>();
  const [thinking, setThinking] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const { me, refresh: refreshMe } = useSession();
  const { refresh: refreshSummary } = useSummary();
  // A question asked before the person allowed the AI waits here until they do.
  const [waiting, setWaiting] = useState<string | null>(null);
  const mustAsk = !PREVIEW && needsAiConsent(me);
  const left = me?.plusEnabled && !me.plus ? me.pockLeftThisMonth ?? null : null;

  const starters = learn
    ? ['What’s the difference between a stock and an ETF?', 'How would I start investing with $100 a month?', 'What is a TFSA?', 'Why is crypto so risky?']
    : anchor ? [`Can I finish ${anchor.label ?? 'this goal'} sooner?`, `How much should I put toward ${anchor.label ?? 'this goal'} each month?`] : STARTERS;

  const askedFromTopic = useRef(false);
  useEffect(() => {
    if (params.q && !askedFromTopic.current) { askedFromTopic.current = true; void ask(params.q); }
  }, [params.q]); // eslint-disable-line react-hooks/exhaustive-deps

  /** `allowed`: the person just said yes, so don't wait on a refreshed profile to know it. */
  async function ask(question: string, allowed = false) {
    const q = question.trim();
    if (q.length < 2 || thinking) return;
    if (mustAsk && !allowed) { setWaiting(q); setDraft(''); return; }
    void Haptics.selectionAsync();
    setDraft('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setThinking(true);
    try {
      if (PREVIEW) {
        await new Promise((r) => setTimeout(r, 600));
        setMessages((m) => [...m, { role: 'pock', text: learn
          ? 'An ETF is a basket of many investments bought in one go — so instead of betting on one company, you own a little of hundreds. A stock is a single company. ETFs are a common way to start because the risk is spread out and fees are usually low.'
          : 'You have about $1,240 you can spend before payday on Oct 1, after rent and your phone bill. That’s roughly $177 a day for the rest of the week.' }]);
      } else {
        const res = await api<{ answer: string; threadId: string; actions?: Action[] }>('/api/pock', { body: { question: q, threadId, ...(anchor ? { anchor } : {}), ...(learn ? { mode: 'learn' } : {}) } });
        setThreadId(res.threadId);
        setMessages((m) => [...m, { role: 'pock', text: res.answer, question: q, actions: res.actions?.length ? res.actions : undefined }]);
        if (left !== null) void refreshMe();
      }
    } catch (e) {
      if (e instanceof ApiError && e.body.needsAiConsent) {
        setMessages((m) => m.slice(0, -1)); setWaiting(q); void refreshMe(); return;
      }
      if (e instanceof ApiError && typeof e.body.threadId === 'string') setThreadId(e.body.threadId);
      setMessages((m) => [...m, { role: 'problem', text: e instanceof Error ? e.message : 'Pock couldn’t answer just now.', upgrade: e instanceof ApiError && e.body.upgrade === true }]);
    } finally {
      setThinking(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  /** The person said yes to something Pock offered: do it, then show where it landed. */
  async function act(msgIndex: number, action: Action) {
    const set = (patch: Partial<Action>) => setMessages((all) => all.map((m, j) => (j !== msgIndex ? m : { ...m, actions: m.actions?.map((x) => (x.id === action.id ? { ...x, ...patch } : x)) })));
    if (action.kind === 'open_screen') {
      const r = await api<{ open: string | null }>('/api/pock/act', { body: { kind: action.kind, params: action.params } }).catch(() => null);
      if (r?.open) router.push(r.open as never);
      return;
    }
    set({ state: 'busy' }); void Haptics.selectionAsync();
    try {
      const r = await api<{ open: string | null }>('/api/pock/act', { body: { kind: action.kind, params: action.params } });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      set({ state: 'done', note: r.open ?? undefined });
      void refreshSummary();
    } catch (e) { set({ state: 'error', note: e instanceof Error ? e.message : 'That couldn’t be done.' }); }
  }

  /** A person reviews reported answers: AI can be wrong, and money answers matter. */
  async function report(index: number) {
    const m = messages[index];
    if (!m) return;
    setMessages((all) => all.map((x, j) => (j === index ? { ...x, reported: true } : x)));
    try {
      await api('/api/feedback', { body: { kind: 'bug', page: 'pock-answer', message: `Reported Pock answer.\n\nQuestion: ${m.question ?? '(unknown)'}\n\nAnswer: ${m.text}`.slice(0, 4000) } });
    } catch { /* the flag stays shown; the report is best effort */ }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + space.sm, paddingHorizontal: space.xl, paddingBottom: space.md, borderBottomWidth: 0.5, borderBottomColor: c.border }}>
        {embedded ? <View style={{ width: 20 }} /> : <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close"><Text style={[type.body, { color: a.accent }]}>Done</Text></Pressable>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PockMark size={22} color={a.accent} glasses={learn} />
          <Text style={[type.headline, { color: c.text }]}>Ask Pock</Text>
        </View>
        <Pressable onPress={() => { setMessages([]); setThreadId(undefined); }} hitSlop={12} accessibilityLabel="New conversation" disabled={!messages.length}>
          <Icon name="square.and.pencil" size={20} color={messages.length ? a.accent : c.surface2} />
        </Pressable>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.xl, gap: space.md, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {waiting !== null || (mustAsk && messages.length === 0) ? (
          <AiConsentCard
            onAllowed={() => { const q = waiting; setWaiting(null); if (q) void ask(q, true); }}
            onDeclined={waiting !== null ? () => setWaiting(null) : undefined}
          />
        ) : null}
        {messages.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
            <View style={{ alignItems: 'center', gap: space.md }}>
              <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}><PockMark size={40} color={a.accent} glasses={learn} /></View>
              <Text style={[type.title3, { color: c.text, textAlign: 'center' }]}>{learn ? 'Ask me anything about investing' : anchor ? `Ask about ${anchor.label ?? 'this goal'}` : 'Ask me about your money'}</Text>
              <Text style={[type.subhead, { color: c.textMuted, textAlign: 'center', lineHeight: 21 }]}>{learn ? 'Stocks, ETFs, TFSAs, budgeting — any money question, explained simply. For learning, not advice.' : 'I can see your bills, spending and goals. Tell me what you spent or what to set up and I’ll get it ready; you tap to confirm. I never move money.'}</Text>
            </View>
            <TourTarget id="askBox" style={{ gap: 8 }}>
              {starters.map((s) => (
                <Pressable key={s} onPress={() => void ask(s)} style={({ pressed }) => ({ padding: 14, borderRadius: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.7 : 1 })}>
                  <Text style={[type.subhead, { color: c.text }]}>{s}</Text>
                </Pressable>
              ))}
            </TourTarget>
          </View>
        ) : messages.map((m, i) => (
          <Animated.View key={i} entering={FadeInUp.duration(250)} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <View style={{
              paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6,
              borderBottomRightRadius: m.role === 'user' ? 6 : 18, borderBottomLeftRadius: m.role === 'user' ? 18 : 6,
              backgroundColor: m.role === 'user' ? a.accent : m.role === 'problem' ? c.surface2 : c.surface,
              borderWidth: m.role === 'pock' ? 1 : 0, borderColor: c.border,
            }}>
              <Text style={[type.body, { color: m.role === 'user' ? onAccent : m.role === 'problem' ? c.textMuted : c.text, lineHeight: 22 }]}>{m.text}</Text>
              {m.role === 'pock' && !PREVIEW ? (
                <Pressable onPress={() => void report(i)} disabled={m.reported} hitSlop={8} accessibilityRole="button" accessibilityLabel="Report this answer" style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                  <Text style={[type.caption, { color: c.textSubtle }]}>{m.reported ? 'Reported. Thank you.' : 'Wrong or unhelpful? Report'}</Text>
                </Pressable>
              ) : null}
              {m.actions?.map((x) => <ActionCard key={x.id} action={x} onDo={() => void act(i, x)} onSkip={() => setMessages((all) => all.map((mm, j) => (j !== i ? mm : { ...mm, actions: mm.actions?.map((y) => (y.id === x.id ? { ...y, state: 'skipped' } : y)) })))} />)}
              {m.upgrade ? (
                <Pressable onPress={() => router.push('/plus')} style={{ marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: a.accent }}>
                  <Text style={{ fontFamily: font.semibold, color: onAccent }}>Try Pockit Plus free</Text>
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        ))}
        {thinking ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={a.accent} size="small" />
            <Text style={[type.footnote, { color: c.textMuted }]}>Pock is looking at your numbers…</Text>
          </View>
        ) : null}
      </ScrollView>

      {left !== null ? (
        <Text style={[type.caption, { color: c.textMuted, textAlign: 'center', paddingTop: 6 }]}>
          {left} free question{left === 1 ? '' : 's'} left this month · <Text style={{ color: a.accent }} onPress={() => router.push('/plus')}>Go unlimited</Text>
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: space.sm, paddingHorizontal: space.lg, paddingBottom: embedded ? 96 : Math.max(insets.bottom, space.md), borderTopWidth: 0.5, borderTopColor: c.border }}>
        <TextInput value={draft} onChangeText={setDraft} placeholder={learn ? 'Ask about investing or money' : 'Ask anything about your money'} placeholderTextColor={c.textSubtle} multiline
          accessibilityLabel="Your question" onSubmitEditing={() => void ask(draft)} blurOnSubmit
          style={{ flex: 1, maxHeight: 120, minHeight: 44, borderRadius: radius.control, backgroundColor: c.surface2, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontFamily: font.regular, fontSize: 16, color: c.text, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }} />
        <Pressable onPress={() => void ask(draft)} disabled={draft.trim().length < 2 || thinking} accessibilityLabel="Send"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: draft.trim().length >= 2 && !thinking ? a.accent : c.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="arrow.up" size={20} color={draft.trim().length >= 2 && !thinking ? onAccent : c.textSubtle} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/** One thing Pock offers to do, with a clear yes and a clear no. */
function ActionCard({ action, onDo, onSkip }: { action: Action; onDo: () => void; onSkip: () => void }) {
  const c = useColors();
  const a = c.section.home;
  const done = action.state === 'done';
  if (action.state === 'skipped') return <Text style={[type.caption, { color: c.textSubtle, marginTop: 8 }]}>Skipped: {action.title}</Text>;
  return (
    <Animated.View entering={FadeInUp.duration(260)} style={{ marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: done ? c.surface2 : a.soft, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={done ? 'checkmark' : action.kind === 'open_screen' ? 'chevron.right' : 'sparkles'} size={16} color={done ? c.positive : a.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyStrong, { color: c.text }]}>{action.title}</Text>
          {action.detail ? <Text style={[type.caption, { color: c.textMuted }]}>{action.detail}</Text> : null}
        </View>
      </View>
      {done ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={[type.footnote, { color: c.positive, fontWeight: '600' }]}>Done</Text>
          {action.note ? (
            <Pressable onPress={() => router.push(action.note as never)} hitSlop={8} accessibilityRole="link">
              <Text style={[type.footnote, { color: a.accent, fontWeight: '600' }]}>See it →</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Pressable onPress={onDo} disabled={action.state === 'busy'} accessibilityRole="button"
            style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, backgroundColor: a.accent, opacity: pressed || action.state === 'busy' ? 0.75 : 1 })}>
            <Text style={{ fontFamily: font.semibold, color: '#ffffff' }}>{action.state === 'busy' ? 'One moment…' : action.confirm}</Text>
          </Pressable>
          {action.kind !== 'open_screen' ? (
            <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button" style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
              <Text style={[type.footnote, { color: c.textMuted, fontWeight: '600' }]}>Not now</Text>
            </Pressable>
          ) : null}
          {action.state === 'error' ? <Text style={[type.caption, { color: c.negative, flex: 1 }]}>{action.note}</Text> : null}
        </View>
      )}
    </Animated.View>
  );
}


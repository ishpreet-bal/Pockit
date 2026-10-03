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
import { font, radius, space, type, useColors, useIsDark } from '@/theme/tokens';

interface Msg { role: 'user' | 'pock' | 'problem'; text: string; upgrade?: boolean }

const STARTERS = [
  'How much can I spend this week?',
  'Where did most of my money go this month?',
  'Am I on track with my goals?',
  'How does “safe to spend” work?',
];

/**
 * Ask Pock: a plain conversation about your own money. Answers come from the server,
 * which grounds them in this account's real numbers. Opened from a goal, the goal
 * travels along as the subject so "can I finish this sooner?" needs no explaining.
 */
export default function Pock() {
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
  const left = me?.plusEnabled && !me.plus ? me.pockLeftThisMonth ?? null : null;

  const starters = learn
    ? ['What’s the difference between a stock and an ETF?', 'How would I start investing with $100 a month?', 'What is a TFSA?', 'Why is crypto so risky?']
    : anchor ? [`Can I finish ${anchor.label ?? 'this goal'} sooner?`, `How much should I put toward ${anchor.label ?? 'this goal'} each month?`] : STARTERS;

  const askedFromTopic = useRef(false);
  useEffect(() => {
    if (params.q && !askedFromTopic.current) { askedFromTopic.current = true; void ask(params.q); }
  }, [params.q]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ask(question: string) {
    const q = question.trim();
    if (q.length < 2 || thinking) return;
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
        const res = await api<{ answer: string; threadId: string }>('/api/pock', { body: { question: q, threadId, ...(anchor ? { anchor } : {}), ...(learn ? { mode: 'learn' } : {}) } });
        setThreadId(res.threadId);
        setMessages((m) => [...m, { role: 'pock', text: res.answer }]);
        if (left !== null) void refreshMe();
      }
    } catch (e) {
      if (e instanceof ApiError && typeof e.body.threadId === 'string') setThreadId(e.body.threadId);
      setMessages((m) => [...m, { role: 'problem', text: e instanceof Error ? e.message : 'Pock couldn’t answer just now.', upgrade: e instanceof ApiError && e.body.upgrade === true }]);
    } finally {
      setThinking(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + space.sm, paddingHorizontal: space.xl, paddingBottom: space.md, borderBottomWidth: 0.5, borderBottomColor: c.border }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close"><Text style={[type.body, { color: a.accent }]}>Done</Text></Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PockMark size={22} color={a.accent} />
          <Text style={[type.headline, { color: c.text }]}>{learn ? 'Investing tutor' : 'Pock'}</Text>
        </View>
        <Pressable onPress={() => { setMessages([]); setThreadId(undefined); }} hitSlop={12} accessibilityLabel="New conversation" disabled={!messages.length}>
          <Icon name="square.and.pencil" size={20} color={messages.length ? a.accent : c.surface2} />
        </Pressable>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: space.xl, gap: space.md, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {messages.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
            <View style={{ alignItems: 'center', gap: space.md }}>
              <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}><PockMark size={40} color={a.accent} /></View>
              <Text style={[type.title3, { color: c.text, textAlign: 'center' }]}>{learn ? 'Ask me anything about investing' : anchor ? `Ask about ${anchor.label ?? 'this goal'}` : 'Ask me about your money'}</Text>
              <Text style={[type.subhead, { color: c.textMuted, textAlign: 'center', lineHeight: 21 }]}>{learn ? 'Stocks, ETFs, TFSAs, budgeting — any money question, explained simply. For learning, not advice.' : 'I can see your bills, spending and goals, and I explain things plainly. I never move money.'}</Text>
            </View>
            <View style={{ gap: 8 }}>
              {starters.map((s) => (
                <Pressable key={s} onPress={() => void ask(s)} style={({ pressed }) => ({ padding: 14, borderRadius: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.7 : 1 })}>
                  <Text style={[type.subhead, { color: c.text }]}>{s}</Text>
                </Pressable>
              ))}
            </View>
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
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.md), borderTopWidth: 0.5, borderTopColor: c.border }}>
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

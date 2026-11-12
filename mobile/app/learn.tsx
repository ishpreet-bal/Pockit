import { useEffect, useState } from 'react';
import { HomeButton, InvestingGate } from '@/components/InvestingGate';
import { LESSONS as TOPICS, type Level } from '@/data/lessons';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { lessonsRead, markLessonRead } from '@/lib/prefs';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Card, Screen } from '@/components/ui';
import { Button } from '@/components/form';
import { space, type, useColors } from '@/theme/tokens';

/**
 * "Want to learn about investing?"
 *
 * A short menu of the main things people invest in. Nothing is explained until
 * someone taps a topic — then it's three plain sentences, a sense of the risk,
 * and a way to ask the tutor anything else. Curiosity-led, not a lecture.
 */
export { LESSONS as TOPICS } from '@/data/lessons';
export type { Level } from '@/data/lessons';

export default function LearnGated() {
  return <InvestingGate><Learn /></InvestingGate>;
}

function Learn() {
  const c = useColors();
  const a = c.section.invest;
  const params = useLocalSearchParams<{ level?: Level; topic?: string }>();
  const [open, setOpen] = useState<string | null>(params.topic ?? null);
  const [done, setDone] = useState<string[]>([]);
  const list = params.level && params.level !== 'advanced' ? TOPICS.filter((t) => t.level === params.level) : TOPICS;
  useEffect(() => { void lessonsRead().then(setDone); }, []);
  useEffect(() => { if (open) { void markLessonRead(open); setDone((d) => d.includes(open) ? d : [...d, open]); } }, [open]);

  const askTutor = (question?: string) =>
    router.push({ pathname: '/pock', params: { mode: 'learn', ...(question ? { q: question } : {}) } });

  return (
    <Screen section="invest" title={params.level === 'intermediate' ? 'Going further' : 'Learn to invest'} back right={<HomeButton />}>
      <Text style={[type.body, { color: c.textMuted, lineHeight: 23, marginBottom: space.xl }]}>
        Tap anything you’re curious about. Each one is a quick, plain explanation — no jargon, and nothing to buy.
      </Text>
      <View style={{ gap: 10 }}>
        {list.map((t, i) => {
          const isOpen = open === t.id;
          return (
            <Card key={t.id}>
              <Pressable onPress={() => { void Haptics.selectionAsync(); setOpen(isOpen ? null : t.id); }} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: done.includes(t.id) ? a.accent : c.border, backgroundColor: done.includes(t.id) ? a.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[type.caption, { letterSpacing: 0, color: done.includes(t.id) ? '#fff' : c.textMuted }]}>{done.includes(t.id) ? '✓' : i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.headline, { color: c.text }]}>{t.title}</Text>
                  <Text style={[type.footnote, { color: c.textMuted }]}>{t.line}</Text>
                </View>
                <Text style={[type.title3, { color: c.textSubtle }]}>{isOpen ? '−' : '+'}</Text>
              </Pressable>
              {isOpen ? (
                <Animated.View entering={FadeIn.duration(220)} style={{ paddingBottom: space.xl, gap: 16 }}>
                  {t.sections.map((sec) => (
                    <View key={sec.heading} style={{ gap: 4 }}>
                      <Text style={[type.label, { color: c.textMuted }]}>{sec.heading}</Text>
                      <Text style={[type.subhead, { color: c.text, lineHeight: 23 }]}>{sec.text}</Text>
                    </View>
                  ))}
                  <Text style={[type.caption, { color: a.accent, marginTop: 4 }]}>RISK: {t.risk.toUpperCase()}</Text>
                  <Pressable onPress={() => askTutor(t.ask)} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                    <Text style={[type.subhead, { color: a.accent }]}>Ask: “{t.ask}” →</Text>
                  </Pressable>
                </Animated.View>
              ) : null}
            </Card>
          );
        })}
      </View>
      <View style={{ marginTop: space.xl }}>
        <Button label="Ask Pock anything" accent={a.accent} onPress={() => askTutor()} />
      </View>
      <Text style={[type.caption, { color: c.textSubtle, marginTop: space.lg, textAlign: 'center' }]}>For learning only — not financial advice.</Text>
    </Screen>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { api } from './api';
import { PREVIEW, useSession } from './session';
import { space, type, useColors } from '@/theme/tokens';

/**
 * The walkthrough: the app dims, one part of a page lights up, and a short card
 * says what it is and how to use it. Next moves on — across every tab — and
 * Skip ends it anywhere. Pages mark the parts worth showing with <TourTarget>.
 */

interface Step { route: '/' | '/spending' | '/ask' | '/goals' | '/invest'; target: string; title: string; body: string }

const STEPS: Step[] = [
  { route: '/', target: 'hero', title: 'What you can spend', body: 'Your money, minus every bill still due before payday. If this number is fine, you’re fine.' },
  { route: '/', target: 'shortcuts', title: 'One tap to the tools', body: 'Add a purchase, check your bills, set a budget, or work out what a drive will cost in gas.' },
  { route: '/', target: 'runway', title: 'Your runway to payday', body: 'Each bill on the day it comes out, and what you’ll have left after it. Payday is at the bottom.' },
  { route: '/', target: 'pockNote', title: 'Pock keeps an eye out', body: 'A note about your month. Tap it to ask Pock anything about your money.' },
  { route: '/spending', target: 'spendTools', title: 'Spending, and what goes with it', body: 'Your budget, bills, every purchase and trip costs all start from here.' },
  { route: '/spending', target: 'calendar', title: 'Your month at a glance', body: 'Each square is a day. The brighter it is, the more went out.' },
  { route: '/ask', target: 'askBox', title: 'Ask Pock', body: 'Ask in plain words — “can I afford a $200 concert this month?” Pock sees your numbers and never moves money.' },
  { route: '/goals', target: 'goals', title: 'Goals', body: 'A trip, a car, a safety net. Pockit works out what to put aside each month and shows if you’re on pace.' },
  { route: '/invest', target: 'learn', title: 'Learn to invest', body: 'New to it? A gentle guide and a tutor for any question. Pockit never buys or sells anything.' },
];

type Measure = () => Promise<{ x: number; y: number; width: number; height: number } | null>;

interface TourValue {
  register: (id: string, m: Measure | null) => void;
  start: () => void;
  offer: () => void;
}
const Ctx = createContext<TourValue | null>(null);

export function useTour() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTour outside TourProvider');
  return v;
}

/** Wrap a part of a page the tour should be able to light up. */
export function TourTarget({ id, children, style }: { id: string; children: ReactNode; style?: ViewStyle }) {
  const ctx = useContext(Ctx);
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!ctx) return;
    ctx.register(id, () => new Promise((resolve) => {
      if (!ref.current) return resolve(null);
      ref.current.measureInWindow((x, y, width, height) => resolve(width ? { x, y, width, height } : null));
    }));
    return () => ctx.register(id, null);
  }, [id]);
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const targets = useRef(new Map<string, Measure>());
  const [step, setStep] = useState<number | null>(null); // -1 = the "want a tour?" card
  const register = useCallback((id: string, m: Measure | null) => { if (m) targets.current.set(id, m); else targets.current.delete(id); }, []);
  const start = useCallback(() => setStep(0), []);
  const offer = useCallback(() => setStep(-1), []);
  return (
    <Ctx.Provider value={{ register, start, offer }}>
      {children}
      {step !== null ? <Overlay step={step} setStep={setStep} targets={targets.current} /> : null}
    </Ctx.Provider>
  );
}

function Overlay({ step, setStep, targets }: { step: number; setStep: (s: number | null) => void; targets: Map<string, Measure> }) {
  const c = useColors();
  const a = c.section.home.accent;
  const { width, height } = useWindowDimensions();
  const { refresh } = useSession();
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const s = step >= 0 ? STEPS[step] : null;

  useEffect(() => {
    setRect(null);
    if (!s) return;
    router.navigate(s.route);
    // Let the page slide in before measuring where the highlighted part ended up.
    const t = setTimeout(async () => { setRect((await targets.get(s.target)?.()) ?? null); }, 480);
    return () => clearTimeout(t);
  }, [step]);

  async function finish() {
    setStep(null);
    router.navigate('/');
    if (!PREVIEW) { try { await api('/api/onboarding/state', { method: 'PATCH', body: { tourCompleted: true } }); await refresh(); } catch { /* offered again next time */ } }
  }
  const next = () => { void Haptics.selectionAsync(); if (step + 1 >= STEPS.length) void finish(); else setStep(step + 1); };

  const dim = 'rgba(0,0,0,0.72)';
  const pad = 8;
  const r = rect ? { x: Math.max(4, rect.x - pad), y: Math.max(4, rect.y - pad), w: Math.min(width - 8, rect.width + pad * 2), h: Math.min(height * 0.55, rect.height + pad * 2) } : null;
  const below = r ? r.y + r.h / 2 < height * 0.5 : true;

  const card = (
    <Animated.View key={step} entering={FadeIn.duration(220)} style={{
      position: 'absolute', left: space.lg, right: space.lg,
      ...(r ? (below ? { top: r.y + r.h + 14 } : { bottom: height - r.y + 14 }) : { top: height * 0.32 }),
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 0.5, borderColor: c.border, padding: space.lg,
    }}>
      {s ? (
        <>
          <Text style={[type.caption, { color: a }]}>{`${step + 1} OF ${STEPS.length}`}</Text>
          <Text style={[type.headline, { color: c.text, marginTop: 6 }]}>{s.title}</Text>
          <Text style={[type.subhead, { color: c.textMuted, marginTop: 6, lineHeight: 22 }]}>{s.body}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.lg }}>
            <Pressable onPress={() => void finish()} hitSlop={10} accessibilityRole="button"><Text style={[type.label, { color: c.textMuted }]}>Skip</Text></Pressable>
            <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
              {step > 0 ? <Pressable onPress={() => setStep(step - 1)} hitSlop={10} accessibilityRole="button"><Text style={[type.label, { color: c.textMuted }]}>Back</Text></Pressable> : null}
              <Pressable onPress={next} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: a, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 9, opacity: pressed ? 0.8 : 1 })}>
                <Text style={[type.label, { color: '#fff' }]}>{step + 1 >= STEPS.length ? 'Done' : 'Next'}</Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : (
        <>
          <Text style={[type.title2, { color: c.text }]}>Want a quick tour?</Text>
          <Text style={[type.subhead, { color: c.textMuted, marginTop: 8, lineHeight: 22 }]}>Thirty seconds, one page at a time — what each part of Pockit does and how to use it. You can skip any time.</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 18, alignItems: 'center', marginTop: space.lg }}>
            <Pressable onPress={() => void finish()} hitSlop={10} accessibilityRole="button"><Text style={[type.label, { color: c.textMuted }]}>Not now</Text></Pressable>
            <Pressable onPress={() => setStep(0)} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: a, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 9, opacity: pressed ? 0.8 : 1 })}>
              <Text style={[type.label, { color: '#fff' }]}>Show me</Text>
            </Pressable>
          </View>
        </>
      )}
    </Animated.View>
  );

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} accessibilityViewIsModal>
      {r ? (
        <>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: r.y, backgroundColor: dim }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: r.y + r.h, bottom: 0, backgroundColor: dim }} />
          <View style={{ position: 'absolute', left: 0, width: r.x, top: r.y, height: r.h, backgroundColor: dim }} />
          <View style={{ position: 'absolute', left: r.x + r.w, right: 0, top: r.y, height: r.h, backgroundColor: dim }} />
          <View pointerEvents="none" style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 10, borderWidth: 1.5, borderColor: a }} />
        </>
      ) : <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: dim }} />}
      {card}
    </Animated.View>
  );
}


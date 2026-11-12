import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dimensions, Pressable, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useScreenScroll } from '@/components/ui';
import * as Haptics from 'expo-haptics';
import { api } from './api';
import { PREVIEW, useSession } from './session';
import { space, type, useColors } from '@/theme/tokens';

/**
 * The walkthrough: the app dims, one part of a page lights up, and a short card
 * says what it is and how to use it. Next moves on — across every tab — and
 * Skip ends it anywhere. Pages mark the parts worth showing with <TourTarget>.
 */

interface Step { route: '/' | '/spending' | '/ask' | '/goals' | '/together'; target: string; title: string; body: string }

const STEPS: Step[] = [
  { route: '/', target: 'hero', title: 'What you can spend', body: 'Your money, minus every bill still due before payday. If this number is fine, you’re fine.' },
  { route: '/', target: 'shortcuts', title: 'One tap to the tools', body: 'Add a purchase, check your bills, set a budget, or work out what a drive will cost in gas.' },
  { route: '/', target: 'runway', title: 'Your countdown to payday', body: 'How much a day is safe, what’s free versus set aside, and only the bills and card payments due before your next pay.' },
  { route: '/', target: 'pockNote', title: 'Pock keeps an eye out', body: 'A note about your month. Tap it to ask Pock anything about your money.' },
  { route: '/spending', target: 'spendTools', title: 'Spending, and what goes with it', body: 'Your budget, bills, trends and every purchase start from here.' },
  { route: '/spending', target: 'calendar', title: 'Your month at a glance', body: 'Each square is a day. The brighter it is, the more went out.' },
  { route: '/ask', target: 'askBox', title: 'Ask Pock', body: 'Ask in plain words — “can I afford a $200 concert this month?” Pock sees your numbers and never moves money.' },
  { route: '/goals', target: 'goals', title: 'Goals', body: 'A trip, a car, a safety net. Pockit works out what to put aside each month and shows if you’re on pace.' },
  { route: '/together', target: 'together', title: 'Money you share', body: 'Who owes who with friends, both ways, and shared spaces for budgeting with a partner or roommates.' },
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
  const scroll = useScreenScroll();
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!ctx) return;
    const measure = () => new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
      if (!ref.current) return resolve(null);
      ref.current.measureInWindow((x, y, width, height) => resolve(width ? { x, y, width, height } : null));
    });
    ctx.register(id, async () => {
      const first = await measure();
      if (!first || !scroll) return first;
      // Bring it into a comfortable spot (near the top, room left for the card) before lighting it up.
      const screen = Dimensions.get('window').height;
      const comfortable = first.y >= 90 && first.y + Math.min(first.height, screen * 0.45) <= screen - 240;
      if (comfortable) return first;
      scroll.scrollBy(first.y - 120);
      await new Promise((r) => setTimeout(r, 420));
      return measure();
    });
    return () => ctx.register(id, null);
  }, [id, scroll]);
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
    if (!s) { setRect(null); return; }
    // The previous highlight stays put while the next part is found, then glides to it.
    router.navigate(s.route);
    let alive = true;
    const t = setTimeout(async () => { const r = await targets.get(s.target)?.(); if (alive) setRect(r ?? null); }, 420);
    return () => { alive = false; clearTimeout(t); };
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
    <Animated.View layout={LinearTransition.duration(320).easing(Easing.out(Easing.cubic))} style={{
      position: 'absolute', left: space.lg, right: space.lg,
      // Nothing to light on this page (yet): sit low, above the tabs, and leave the page readable.
      ...(r ? (below ? { top: r.y + r.h + 14 } : { bottom: height - r.y + 14 }) : s ? { bottom: 110 } : { top: height * 0.32 }),
      backgroundColor: c.surface, borderRadius: 16, borderWidth: 0.5, borderColor: c.border, padding: space.lg,
    }}>
     <Animated.View key={step} entering={FadeIn.duration(260)}>
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
    </Animated.View>
  );

  return (
    <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(180)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} accessibilityViewIsModal>
      <Spotlight r={r} dim={dim} color={a} width={width} height={height} />
      {card}
    </Animated.View>
  );
}


/**
 * The dimmed page with one part lit. The four dim panes move together on a timing
 * curve, so stepping through the tour glides from part to part instead of blinking.
 */
function Spotlight({ r, dim, color, width, height }: { r: { x: number; y: number; w: number; h: number } | null; dim: string; color: string; width: number; height: number }) {
  // With nothing to light (yet), the hole closes to a point in the middle: the whole page dims.
  const goal = r ?? { x: width / 2, y: height * 0.4, w: 0, h: 0 };
  const x = useSharedValue(goal.x), y = useSharedValue(goal.y), w = useSharedValue(goal.w), h = useSharedValue(goal.h);
  const ring = useSharedValue(r ? 1 : 0);
  useEffect(() => {
    const ease = { duration: 360, easing: Easing.inOut(Easing.cubic) };
    x.value = withTiming(goal.x, ease); y.value = withTiming(goal.y, ease);
    w.value = withTiming(goal.w, ease); h.value = withTiming(goal.h, ease);
    ring.value = withTiming(r ? 1 : 0, { duration: 240 });
  }, [goal.x, goal.y, goal.w, goal.h]);
  const top = useAnimatedStyle(() => ({ height: y.value }));
  const bottom = useAnimatedStyle(() => ({ top: y.value + h.value }));
  const left = useAnimatedStyle(() => ({ top: y.value, height: h.value, width: x.value }));
  const right = useAnimatedStyle(() => ({ top: y.value, height: h.value, left: x.value + w.value }));
  const outline = useAnimatedStyle(() => ({ left: x.value, top: y.value, width: w.value, height: h.value, opacity: ring.value }));
  return (
    <>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: dim }, top]} />
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: dim }, bottom]} />
      <Animated.View style={[{ position: 'absolute', left: 0, backgroundColor: dim }, left]} />
      <Animated.View style={[{ position: 'absolute', right: 0, backgroundColor: dim }, right]} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderRadius: 12, borderWidth: 1.5, borderColor: color }, outline]} />
    </>
  );
}

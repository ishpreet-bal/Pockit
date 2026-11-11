import { useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

/**
 * Pockit's design system: "Runway".
 *
 * Your money as a countdown to payday. Warm black, one burnt-orange accent,
 * and a single serif face for everything — big plain numbers, small spaced-out
 * capitals for labels, hairlines instead of boxes. Light mode is the same idea
 * on warm paper.
 *
 * Every section shares the one accent: colour means "this matters", never
 * "which tab you're on".
 */

export type Section = 'home' | 'spending' | 'goals' | 'invest' | 'more';

const ACCENT_DARK = '#da5100';
const ACCENT_LIGHT = '#c04600';
const sections = (accent: string, soft: string) => ({
  home: { accent, soft }, spending: { accent, soft }, goals: { accent, soft }, invest: { accent, soft }, more: { accent, soft },
});

const dark = {
  // Warm black, with cards a step lighter so they read as soft shapes.
  bg: '#0e0f0c',
  surface: '#1a1b17',
  surface2: '#24261f',
  border: '#2b2d27',
  text: '#eceee6',
  textMuted: '#9a9e90',
  textSubtle: '#62665a',
  positive: '#3ccf91',
  negative: '#ff6b78',
  warning: '#e8b04a',
  section: sections(ACCENT_DARK, '#2a1a10'),
};

const light: typeof dark = {
  // Warm cream paper, with near-white cards on top.
  bg: '#f6f3ec',
  surface: '#fffcf6',
  surface2: '#ece7dc',
  border: '#e2dccf',
  text: '#1c1a15',
  textMuted: '#6d685b',
  textSubtle: '#a39d8e',
  positive: '#1d8a5b',
  negative: '#c9283b',
  warning: '#9a6a12',
  section: sections(ACCENT_LIGHT, '#f6e2d2'),
};

export type Palette = typeof light;

/** Light, dark, or follow the phone. Set from Settings; 'system' unless the person chose otherwise. */
export type Appearance = 'system' | 'light' | 'dark';
// Pockit opens in warm cream (light); dark and "match phone" are a choice in Settings.
let appearance: Appearance = 'light';
const listeners = new Set<() => void>();
export function setAppearance(next: Appearance) { appearance = next; listeners.forEach((l) => l()); }
export function useAppearance(): Appearance {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => appearance, () => appearance);
}

export function useIsDark() {
  const system = useColorScheme();
  const chosen = useAppearance();
  return chosen === 'system' ? system === 'dark' : chosen === 'dark';
}

/* ---------- Accent colour (Settings): Pockit orange unless the person picks another. ---------- */
// A hue from 0 to 360, or null for Pockit's own orange. The light theme gets a deeper
// shade and the dark theme a brighter one, so text on it stays readable in both.
let accentHue: number | null = null;
const hueListeners = new Set<() => void>();
export function setAccentHue(next: number | null) { accentHue = next; hueListeners.forEach((l) => l()); }
export function useAccentHue(): number | null {
  return useSyncExternalStore((l) => { hueListeners.add(l); return () => { hueListeners.delete(l); }; }, () => accentHue, () => accentHue);
}
export function hsl(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
const tinted = new Map<string, Palette>();
function withHue(base: Palette, isDark: boolean, hue: number): Palette {
  const key = `${isDark ? 'd' : 'l'}${hue}`;
  let p = tinted.get(key);
  if (!p) {
    p = { ...base, section: sections(isDark ? hsl(hue, 85, 62) : hsl(hue, 78, 40), isDark ? hsl(hue, 45, 16) : hsl(hue, 70, 92)) };
    tinted.set(key, p);
  }
  return p;
}

export function useColors(): Palette {
  const isDark = useIsDark();
  const hue = useAccentHue();
  const base = isDark ? dark : light;
  return hue === null ? base : withHue(base, isDark, hue);
}

/**
 * Two faces, the way Wealthsimple does it: a serif for the big moments —
 * headlines and the money figures — and a clean sans (DM Sans) for everything
 * you read and tap.
 */
export const font = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
  italic: 'DMSans_400Regular_Italic',
  serif: 'Tinos_400Regular',
  serifBold: 'Tinos_700Bold',
  serifItalic: 'Tinos_400Regular_Italic',
};

export const type = {
  hero: { fontFamily: font.serifBold, fontSize: 44, letterSpacing: -1.6, lineHeight: 50, fontVariant: ['tabular-nums' as const] },
  largeTitle: { fontFamily: font.serifBold, fontSize: 34, letterSpacing: -1 },
  title2: { fontFamily: font.serifBold, fontSize: 26, letterSpacing: -0.6 },
  title3: { fontFamily: font.medium, fontSize: 19, letterSpacing: -0.2 },
  headline: { fontFamily: font.semibold, fontSize: 16, letterSpacing: -0.1 },
  body: { fontFamily: font.regular, fontSize: 16 },
  bodyStrong: { fontFamily: font.medium, fontSize: 16 },
  subhead: { fontFamily: font.regular, fontSize: 15 },
  footnote: { fontFamily: font.regular, fontSize: 13 },
  /** Small spaced capitals: dates, labels. Pass text already upper-cased or use `label`. */
  caption: { fontFamily: font.medium, fontSize: 11, letterSpacing: 0.8 },
  /** Section and screen labels: plain sentence case, never shouty capitals. */
  label: { fontFamily: font.semibold, fontSize: 14, letterSpacing: 0 },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 28 };
export const radius = { control: 14, tile: 12, card: 18, pill: 999 };

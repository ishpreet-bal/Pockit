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
  bg: '#0e0f0c',
  surface: '#141511',
  surface2: '#1b1d18',
  border: '#262822',
  text: '#eceee6',
  textMuted: '#8a8e80',
  textSubtle: '#5c6055',
  positive: ACCENT_DARK,
  negative: '#ff5d6c',
  warning: '#e8b04a',
  section: sections(ACCENT_DARK, '#241a12'),
};

const light: typeof dark = {
  bg: '#f3f0e8',
  surface: '#f8f6f0',
  surface2: '#e8e4d9',
  border: '#d9d4c7',
  text: '#17160f',
  textMuted: '#6d685b',
  textSubtle: '#a39d8e',
  positive: ACCENT_LIGHT,
  negative: '#c9283b',
  warning: '#9a6a12',
  section: sections(ACCENT_LIGHT, '#f1e1d3'),
};

export type Palette = typeof light;

/** Light, dark, or follow the phone. Set from Settings; 'system' unless the person chose otherwise. */
export type Appearance = 'system' | 'light' | 'dark';
// Pockit is designed dark-first; light and "match phone" are a choice in Settings.
let appearance: Appearance = 'dark';
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

export function useColors(): Palette {
  return useIsDark() ? dark : light;
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
  caption: { fontFamily: font.medium, fontSize: 11, letterSpacing: 1.1 },
  label: { fontFamily: font.medium, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' as const },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 28 };
export const radius = { control: 6, tile: 6, card: 0, pill: 999 };

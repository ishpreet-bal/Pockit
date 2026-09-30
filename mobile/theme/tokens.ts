import { useColorScheme } from 'react-native';

/**
 * Pockit's design system: "Lilac".
 *
 * Clean and calm, one strong number per screen, warmth from wording rather than
 * decoration. Light and dark follow the phone's setting.
 *
 * Each section has its own accent so you always know where you are:
 * Home is lilac, Spending rose, Goals teal, Invest blue. The accent tints the tab
 * icon, the chart, progress bars and links on that section — nothing else.
 */

export type Section = 'home' | 'spending' | 'goals' | 'invest' | 'more';

const light = {
  bg: '#fbfbfd',
  surface: '#ffffff',
  surface2: '#f1eff8',
  border: '#ebe8f3',
  text: '#15131c',
  textMuted: '#716c80',
  textSubtle: '#9a95a8',
  positive: '#1f9d57',
  negative: '#d6344c',
  warning: '#b7791f',
  section: {
    home: { accent: '#6d4aff', soft: '#f1edff' },
    spending: { accent: '#e0457b', soft: '#fdecf2' },
    goals: { accent: '#0f9488', soft: '#e3f6f3' },
    invest: { accent: '#2f6bff', soft: '#e9f0ff' },
    more: { accent: '#5b566a', soft: '#f1eff5' },
  },
};

// Dark keeps the structure of the "Harbour" direction, but on a neutral violet-black
// rather than navy, so the section colours stay the only colour on screen.
const dark: typeof light = {
  bg: '#0f0e14',
  surface: '#18171f',
  surface2: '#23222c',
  border: '#27262f',
  text: '#f3f1f8',
  textMuted: '#9a96a8',
  textSubtle: '#6f6b7d',
  positive: '#6ee7a8',
  negative: '#ff7a8a',
  warning: '#f5c26b',
  section: {
    home: { accent: '#a794ff', soft: '#221d3a' },
    spending: { accent: '#ff7aa6', soft: '#351b26' },
    goals: { accent: '#4fd1c0', soft: '#132c2a' },
    invest: { accent: '#7aa2ff', soft: '#172240' },
    more: { accent: '#b9b4c8', soft: '#24222c' },
  },
};

export type Palette = typeof light;

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export function useIsDark() {
  return useColorScheme() === 'dark';
}

export const font = {
  regular: 'BricolageGrotesque_400Regular',
  medium: 'BricolageGrotesque_500Medium',
  semibold: 'BricolageGrotesque_600SemiBold',
  bold: 'BricolageGrotesque_700Bold',
};

/** Apple's text sizes, set in Bricolage Grotesque. */
export const type = {
  hero: { fontFamily: font.bold, fontSize: 46, letterSpacing: -1.4, fontVariant: ['tabular-nums' as const] },
  largeTitle: { fontFamily: font.bold, fontSize: 32, letterSpacing: -0.8 },
  title2: { fontFamily: font.bold, fontSize: 24, letterSpacing: -0.4 },
  title3: { fontFamily: font.semibold, fontSize: 19 },
  headline: { fontFamily: font.semibold, fontSize: 17 },
  body: { fontFamily: font.regular, fontSize: 16 },
  bodyStrong: { fontFamily: font.medium, fontSize: 16 },
  subhead: { fontFamily: font.regular, fontSize: 15 },
  footnote: { fontFamily: font.regular, fontSize: 13 },
  caption: { fontFamily: font.medium, fontSize: 12 },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 28 };
export const radius = { control: 12, tile: 11, card: 20, pill: 999 };

/**
 * Pockit — Tide, for iOS.
 *
 * The same palette as the web app, so the two feel like one product. Dark first:
 * it is the default, and the app ships dark-only until light is designed for
 * native properly rather than inverted.
 *
 * Type follows Apple's Human Interface Guidelines sizes (34 large title, 17 body,
 * 13 footnote) and uses the SYSTEM font — SF Pro on iOS. A custom face is the
 * single fastest way to make a native app feel like a website in a wrapper.
 */
export const colors = {
  bg: '#0b1020',
  surface: '#131a2b',
  surface2: '#1a2236',
  surface3: '#242e46',
  border: '#212a40',
  borderStrong: '#37425f',

  text: '#e8ebf5',
  textMuted: '#98a2bd',
  textSubtle: '#7a85a3',

  accent: '#b3a6ff',
  accentFill: '#9d8cff',
  accentFillText: '#0b1020',
  accentSoft: '#231f45',

  positive: '#4ade9a',
  negative: '#ff7a85',
  warning: '#f5b544',
  warningSoft: '#2c2210',
  goal: '#5ed3f0',
} as const;

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: 0.37 },
  title2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: 0.35 },
  title3: { fontSize: 20, fontWeight: '600' as const, letterSpacing: 0.38 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.41 },
  body: { fontSize: 17, fontWeight: '400' as const, letterSpacing: -0.41 },
  callout: { fontSize: 16, fontWeight: '400' as const, letterSpacing: -0.32 },
  subhead: { fontSize: 15, fontWeight: '400' as const, letterSpacing: -0.24 },
  footnote: { fontSize: 13, fontWeight: '400' as const, letterSpacing: -0.08 },
  caption: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0 },
  /** The hero figure. Tabular so the digits don't shuffle as the number changes. */
  hero: { fontSize: 48, fontWeight: '700' as const, letterSpacing: -1, fontVariant: ['tabular-nums' as const] },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { control: 12, card: 18, pill: 999 } as const;

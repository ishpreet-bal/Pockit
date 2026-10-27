import type { Metadata, Viewport } from 'next';
import { DM_Sans, Tinos } from 'next/font/google';
import './globals.css';

/**
 * The same two families as the iPhone app, so the website and the phone read as
 * one product.
 *
 * DM Sans carries everything you read as language, and the figures in lists and
 * tables (with tabular numbers, so columns of money line up).
 *
 * Tinos, a serif, carries headlines and the big money figures: the warm, printed
 * feel that keeps Pockit from looking like every other finance dashboard.
 *
 * Both are self-hosted by next/font. The CSP allows no external font origins, so a
 * <link> to fonts.googleapis.com would be blocked outright.
 */
const sans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

const serif = Tinos({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '700'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: { default: 'Pockit', template: '%s · Pockit' },
  description: 'A personal financial operating system: understand where your money goes, what you can safely spend, and whether you are on track.',
  applicationName: 'Pockit',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f3ec' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0f0c' },
  ],
};

/**
 * Applied before first paint so the theme never flashes. Inline because an external
 * script would necessarily run after the initial render, which is exactly the frame
 * in which the wrong colours would be visible.
 */
const THEME_SCRIPT = `
(function(){try{
  var stored = localStorage.getItem('pockit-theme');
  // Warm cream unless the person has chosen otherwise, as in the app. Dark is one
  // tap away in the sidebar, and that choice is remembered.
  var theme = stored === 'light' || stored === 'dark' ? stored
    : stored === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : 'light';
  document.documentElement.setAttribute('data-theme', theme);
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

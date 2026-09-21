import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

/**
 * Two families, each doing one job.
 *
 * Space Grotesk carries everything you read as language. It is a grotesque with
 * deliberately odd details — the flat-topped a, the squared bowls — which is what
 * stops the app looking like every other finance dashboard without costing any
 * legibility at 14px.
 *
 * JetBrains Mono carries everything you read as a number. A monospace is the whole
 * "typewriter, but professional" idea: every digit is the same width, so columns of
 * money line up exactly and an animating counter cannot shuffle the layout. It was
 * drawn for reading code for eight hours, so it is unusually clear at small sizes.
 *
 * Both are self-hosted by next/font. The CSP allows no external font origins, so a
 * <link> to fonts.googleapis.com would be blocked outright.
 */
const display = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-numeric',
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
    { media: '(prefers-color-scheme: light)', color: '#faf7f2' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1116' },
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
  var theme = stored && stored !== 'system' ? stored
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

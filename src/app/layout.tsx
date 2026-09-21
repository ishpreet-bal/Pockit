import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

/**
 * Self-hosted by next/font rather than linked from Google. The CSP in next.config.ts
 * allows no external style or font origins, so a <link> to fonts.googleapis.com would
 * be blocked outright — and self-hosting also removes the render-blocking round trip.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
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
    { media: '(prefers-color-scheme: light)', color: '#fbfbfa' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0c0e' },
  ],
};

/**
 * Applied before first paint so the theme never flashes. Inline because an external
 * script would necessarily run after the initial render.
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
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

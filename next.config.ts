import type { NextConfig } from 'next';

const csp = [
  "default-src 'self'",
  // Next injects inline bootstrap scripts; 'unsafe-inline' is required for the
  // App Router runtime. No external script origins are allowed.
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  // The dev-only "N" badge sits over the collapsed sidebar's Expand button and blocks the UI tests. Error overlays still show.
  devIndicators: false,
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['postgres', 'exceljs', 'unpdf'],
  // The migration files are read at runtime, so Next's static tracing cannot see
  // them. Without this they are simply absent from the deployed bundle and the
  // migrate endpoint reports that it applied nothing, with no error to explain it.
  outputFileTracingIncludes: {
    '/api/admin/migrate': ['./drizzle/**/*.sql'],
    '/api/health': ['./drizzle/**/*.sql'],
    '/setup': ['./drizzle/**/*.sql'],
  },
  experimental: {
    // Financial aggregation happens in Server Components; keep the payload lean.
    optimizePackageImports: ['recharts', 'date-fns'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
      {
        // The app's browser version, so /preview can show it in a phone frame on the same site.
        source: '/app/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'") },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
  async rewrites() {
    // The app (public/app) is a single-page app: any /app/... address loads its index.
    return [
      { source: '/app', destination: '/app/index.html' },
      { source: '/app/:path*', destination: '/app/index.html' },
      { source: '/preview', destination: '/preview.html' },
    ];
  },
};

export default nextConfig;

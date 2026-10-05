import { NextResponse, type NextRequest } from 'next/server';

/**
 * Lets the app's browser preview (`npx expo start --web`, on localhost) call the
 * API. The phone app doesn't need this — only browsers check it.
 *
 * Only local addresses are allowed, and no cookies are shared: the preview signs
 * in with the same Bearer token the phone uses, so a website elsewhere gains nothing.
 */
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || !LOCAL.test(origin)) return NextResponse.next();

  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers });
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: '/api/:path*' };

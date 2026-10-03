import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { reverse, searchPlaces } from '@/lib/trip/routing';

export const dynamic = 'force-dynamic';

/** ?q=… searches places (near ?lat&lon when given); ?lat&lon alone names where you are. */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const p = new URL(request.url).searchParams;
  const q = p.get('q')?.trim().slice(0, 120);
  const lat = Number(p.get('lat')), lon = Number(p.get('lon'));
  const near = Number.isFinite(lat) && Number.isFinite(lon) && p.has('lat') ? { lat, lon } : undefined;
  try {
    if (q && q.length >= 2) return NextResponse.json({ places: await searchPlaces(q, near) });
    if (near) return NextResponse.json({ place: await reverse(near.lat, near.lon) });
    return NextResponse.json({ places: [] });
  } catch {
    return NextResponse.json({ error: 'Place search is unavailable right now.' }, { status: 502 });
  }
}

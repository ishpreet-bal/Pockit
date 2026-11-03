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
  const hasCoordinates = p.has('lat') || p.has('lon');
  const near = p.get('lat')?.trim() && p.get('lon')?.trim() && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : undefined;
  if (hasCoordinates && !near) return NextResponse.json({ error: 'Choose a valid location.' }, { status: 400 });
  try {
    if (q && q.length >= 2) return NextResponse.json({ places: await searchPlaces(q, near) });
    if (near) return NextResponse.json({ place: await reverse(near.lat, near.lon) });
    return NextResponse.json({ places: [] });
  } catch {
    return NextResponse.json({ error: 'Place search is unavailable right now.' }, { status: 502 });
  }
}

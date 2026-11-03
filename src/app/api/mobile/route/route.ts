import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { drivingRoute } from '@/lib/trip/routing';

export const dynamic = 'force-dynamic';

/** ?from=lat,lon&to=lat,lon → driving distance, time and the line to draw. */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const p = new URL(request.url).searchParams;
  const parse = (s: string | null) => {
    if (!s || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(s)) return null;
    const [lat, lon] = (s ?? '').split(',').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180 ? { lat: lat!, lon: lon! } : null;
  };
  const from = parse(p.get('from')), to = parse(p.get('to'));
  if (!from || !to) return NextResponse.json({ error: 'Pick where you’re starting and where you’re going.' }, { status: 400 });
  try {
    return NextResponse.json({ route: await drivingRoute(from, to) });
  } catch {
    return NextResponse.json({ error: 'Couldn’t find a driving route between those places.' }, { status: 502 });
  }
}

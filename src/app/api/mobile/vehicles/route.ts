import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { makes, models, vehicle, versions, years } from '@/lib/trip/vehicles';
import { estimateFuel, type Body } from '@/lib/trip/estimate';

export const dynamic = 'force-dynamic';

/**
 * The car picker, one level at a time:
 *   (nothing) → years · ?year → makes · ?year&make → models · ?year&make&model → versions · ?id → the car.
 * Not in the list: ?estimate&year&displ&body&awd&hybrid&fuel → typical fuel use of similar real cars.
 */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const q = new URL(request.url).searchParams;
  if (q.has('estimate')) {
    const year = Number(q.get('year'));
    const displacementL = Number(q.get('displ'));
    const body = q.get('body') as Body;
    const fuel = q.get('fuel');
    if (!Number.isInteger(year) || year < 1984 || year > new Date().getUTCFullYear() + 2 ||
        !(displacementL >= 0.5 && displacementL <= 9) || !['car', 'suv', 'truck', 'van'].includes(body) ||
        (fuel && !['regular', 'premium', 'diesel'].includes(fuel))) {
      return NextResponse.json({ error: 'Enter the year, the engine size in litres (like 2.0), and the kind of vehicle.' }, { status: 400 });
    }
    const e = estimateFuel({ year, displacementL, body, awd: q.get('awd') === '1', hybrid: q.get('hybrid') === '1', fuel: (fuel as 'regular' | 'premium' | 'diesel' | null) ?? null });
    return e ? NextResponse.json({ estimate: e }) : NextResponse.json({ error: 'Not enough similar cars to estimate from. Enter your fuel use from the dashboard instead.' }, { status: 404 });
  }
  const year = q.has('year') ? Number(q.get('year')) : null;
  const make = q.get('make')?.trim();
  const model = q.get('model')?.trim();
  const id = q.has('id') ? Number(q.get('id')) : null;
  if ((id !== null && (!Number.isSafeInteger(id) || id <= 0 || id > 1_000_000)) ||
      (year !== null && (!Number.isInteger(year) || year < 1984 || year > new Date().getUTCFullYear() + 2)) ||
      (make && (!year || make.length > 100)) || (model && (!make || model.length > 150))) {
    return NextResponse.json({ error: 'Choose a valid year, make, model or vehicle ID.' }, { status: 400 });
  }
  try {
    if (id) {
      const v = await vehicle(id);
      return v ? NextResponse.json({ vehicle: v }) : NextResponse.json({ error: 'Car not found.' }, { status: 404 });
    }
    if (!year) return NextResponse.json({ items: (await years()).map(String) });
    if (!make) return NextResponse.json({ items: await makes(year) });
    if (!model) return NextResponse.json({ items: await models(year, make) });
    return NextResponse.json({ versions: await versions(year, make, model) });
  } catch {
    return NextResponse.json({ error: 'The car list is unavailable right now. Try again in a minute, or enter your own fuel use.' }, { status: 502 });
  }
}

import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { makes, models, vehicle, versions, years } from '@/lib/trip/vehicles';

export const dynamic = 'force-dynamic';

/**
 * The car picker, one level at a time:
 *   (nothing) → years · ?year → makes · ?year&make → models · ?year&make&model → versions · ?id → the car.
 */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const q = new URL(request.url).searchParams;
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

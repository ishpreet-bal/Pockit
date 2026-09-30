import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Revoke the app's session token server-side, so a copied token stops working too. */
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}

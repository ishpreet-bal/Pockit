import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { searchAll } from '@/lib/market';

/**
 * Instrument search.
 *
 * The shipped catalogue answers first and always, so search works with or without a
 * market-data key — a search box that only works once an API key is configured is a
 * broken front door. The provider's universe is merged in behind it, which is what
 * lets someone find an instrument nobody thought to curate.
 */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const q = new URL(request.url).searchParams.get('q') ?? '';
  return NextResponse.json({ results: await searchAll(q, 10) });
}

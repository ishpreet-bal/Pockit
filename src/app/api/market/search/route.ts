import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { searchCatalog } from '@/lib/market';

/**
 * Instrument search.
 *
 * Runs against the shipped catalogue, so it returns the same results with or without
 * a market-data key — search is how people find things, and a search box that only
 * works once you have configured an API key is a broken front door.
 */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const q = new URL(request.url).searchParams.get('q') ?? '';
  return NextResponse.json({ results: searchCatalog(q, 8) });
}

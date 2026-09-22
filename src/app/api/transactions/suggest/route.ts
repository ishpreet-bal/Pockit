import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/**
 * What have you called this before?
 *
 * Suggestions come from this workspace's own history, never from a global list of
 * merchants — a shared vocabulary would leak one person's spending into another's
 * autocomplete, which is about as bad as a finance app can get.
 *
 * Each suggestion carries the category it usually gets, so choosing one fills in
 * two fields. That is the part that saves real time; the text alone barely does.
 */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 1) return NextResponse.json({ suggestions: [] });

  const rows = await withUser(ctx.user.id, (tx) =>
    tx.select({
      description: transactions.description,
      categoryId: transactions.categoryId,
      // How often, and how recently — both matter. The shop you used twice last
      // week should beat the one you used five times two years ago.
      uses: sql<number>`count(*)::int`,
      lastUsed: sql<string>`max(${transactions.postedDate})`,
    })
      .from(transactions)
      .where(and(
        eq(transactions.workspaceId, ctx.workspace.id),
        // The merchant is matched as well as the description, because they are
        // frequently different — an import may record "SQ *BLUE BOTTLE" as the
        // description and "Blue Bottle" as the merchant, and someone typing the
        // name they recognise should still find it.
        or(
          ilike(transactions.description, `%${query}%`),
          ilike(transactions.merchantName, `%${query}%`),
        ),
      ))
      .groupBy(transactions.description, transactions.categoryId)
      .orderBy(desc(sql`count(*)`), desc(sql`max(${transactions.postedDate})`))
      .limit(8),
  );

  // A description used with two different categories appears once, under the one it
  // gets most often. Offering the same text twice is a choice nobody can make.
  const seen = new Set<string>();
  const suggestions = rows.filter((row) => {
    const key = row.description.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ suggestions });
}

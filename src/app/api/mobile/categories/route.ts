import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const schema = z.object({ name: z.string().trim().min(1).max(40), kind: z.enum(['expense', 'income']).default('expense') });

/** A category of your own, for anything the built-in ones don't fit. */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Give the category a name (up to 40 characters).' }, { status: 400 });
  const { name, kind } = parsed.data;
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';

  const row = await withUser(ctx.user.id, async (tx) => {
    const same = await tx.select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories)
      .where(and(eq(categories.workspaceId, ctx.workspace.id), eq(categories.kind, kind)));
    const existing = same.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const taken = new Set(same.map((c) => c.slug));
    let slug = base; let n = 2;
    while (taken.has(slug)) slug = `${base}-${n++}`;
    const made = await tx.insert(categories).values({ workspaceId: ctx.workspace.id, name, slug, kind, isPrimary: true, sortOrder: 900 })
      .returning({ id: categories.id, name: categories.name });
    return made[0]!;
  });
  return NextResponse.json({ category: { id: row.id, name: row.name, kind, parentId: null, icon: null } });
}

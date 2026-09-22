import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { withoutUser } from '@/lib/db/client';
import { feedback } from '@/lib/db/schema';
import { checkRateLimit } from '@/lib/auth/rate-limit';

const schema = z.object({
  kind: z.enum(['bug', 'idea', 'confusing', 'praise', 'other']),
  message: z.string().trim().min(3, 'Tell us a little more.').max(4000),
  page: z.string().trim().max(200).optional(),
  contactOk: z.boolean().optional(),
});

/**
 * Somebody telling us something is wrong.
 *
 * Written with `withoutUser` because the table's policy is an INSERT policy keyed on
 * the user id in the row, not a workspace membership check — feedback belongs to a
 * person, not to a workspace, and it deliberately outlives both.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  // Generous, but bounded: a stuck submit button should not be able to write a
  // thousand rows before anyone notices.
  const limit = await checkRateLimit(`feedback:${ctx.user.id}`, 20, 60 * 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'That is a lot of feedback in one hour — thank you. Try again shortly.' },
      { status: 429 },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Write a sentence or two and send it again.' },
      { status: 400 },
    );
  }

  await withoutUser((tx) => tx.insert(feedback).values({
    userId: ctx.user.id,
    workspaceId: ctx.workspace.id,
    kind: parsed.data.kind,
    message: parsed.data.message,
    page: parsed.data.page ?? null,
    contactOk: parsed.data.contactOk ?? false,
  }));

  return NextResponse.json({ ok: true });
}

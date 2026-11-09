import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { aiCompany, hasAiConsent, setAiConsent } from '@/lib/ai/consent';
import { audit } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Whether this person has allowed their data to go to the AI provider, and which one. */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  return NextResponse.json({ provider: aiCompany(), allowed: await hasAiConsent(ctx.user.id) });
}

const body = z.object({ allow: z.boolean() });

/** Allow, or take back, sending data to the AI provider. */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Say yes or no.' }, { status: 400 });
  await setAiConsent(ctx.user.id, parsed.data.allow);
  await audit({ actorUserId: ctx.user.id, action: parsed.data.allow ? 'ai.consent_given' : 'ai.consent_withdrawn', entity: 'user', entityId: ctx.user.id, metadata: { provider: aiCompany() } });
  return NextResponse.json({ provider: aiCompany(), allowed: await hasAiConsent(ctx.user.id) });
}

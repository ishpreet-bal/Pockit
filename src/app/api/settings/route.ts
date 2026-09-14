import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { userProfiles, categories, merchantRules } from '@/lib/db/schema';
import { isSupportedCurrency } from '@/lib/money';
import { audit } from '@/lib/auth/session';

const profileSchema = z.object({
  kind: z.literal('profile'),
  displayName: z.string().trim().max(120).nullable().optional(),
  baseCurrency: z.string().length(3).optional(),
  timezone: z.string().max(64).optional(),
  locale: z.string().max(16).optional(),
  fileRetention: z.enum(['delete_after_extract', 'keep', 'ask']).optional(),
  aiEnabled: z.boolean().optional(),
});

const categorySchema = z.object({
  kind: z.literal('category'),
  categoryId: z.string().uuid(),
  classification: z.enum(['fixed', 'variable']).optional(),
  necessity: z.enum(['essential', 'discretionary']).optional(),
});

const ruleSchema = z.object({
  kind: z.literal('deleteRule'),
  ruleId: z.string().uuid(),
});

const schema = z.discriminatedUnion('kind', [profileSchema, categorySchema, ruleSchema]);

export async function PATCH(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const input = parsed.data;

  if (input.kind === 'profile') {
    if (input.baseCurrency && !isSupportedCurrency(input.baseCurrency)) {
      return NextResponse.json({ error: 'That currency is not supported.' }, { status: 400 });
    }
    // Only fields the user actually submitted are written.
    const values: Record<string, unknown> = {};
    if (input.displayName !== undefined) values.displayName = input.displayName;
    if (input.baseCurrency) values.baseCurrency = input.baseCurrency.toUpperCase();
    if (input.timezone) values.timezone = input.timezone;
    if (input.locale) values.locale = input.locale;
    if (input.fileRetention) values.fileRetention = input.fileRetention;
    if (input.aiEnabled !== undefined) values.aiEnabled = input.aiEnabled;

    if (Object.keys(values).length > 0) {
      await withUser(ctx.user.id, (tx) =>
        tx.update(userProfiles).set(values).where(eq(userProfiles.userId, ctx.user.id)),
      );
      await audit({
        actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
        action: 'settings.profile_update', entity: 'user_profile', entityId: ctx.user.id,
        metadata: { fields: Object.keys(values) },
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (input.kind === 'category') {
    // Spec §48: these classifications are the user's to set, not the app's to assume.
    const values: Record<string, unknown> = {};
    if (input.classification) values.classification = input.classification;
    if (input.necessity) values.necessity = input.necessity;
    if (Object.keys(values).length === 0) return NextResponse.json({ ok: true });

    await withUser(ctx.user.id, (tx) =>
      tx.update(categories).set(values).where(and(
        eq(categories.id, input.categoryId),
        eq(categories.workspaceId, ctx.workspace.id),
      )),
    );
    return NextResponse.json({ ok: true });
  }

  // Deleting a learned rule — the visible, reversible half of "the AI learns".
  await withUser(ctx.user.id, (tx) =>
    tx.update(merchantRules).set({ isActive: false }).where(and(
      eq(merchantRules.id, input.ruleId),
      eq(merchantRules.workspaceId, ctx.workspace.id),
    )),
  );
  await audit({
    actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
    action: 'settings.rule_delete', entity: 'merchant_rule', entityId: input.ruleId,
  });
  return NextResponse.json({ ok: true });
}

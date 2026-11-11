import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { withoutUser } from '@/lib/db/client';
import { userProfiles, users } from '@/lib/db/schema';
import { createUserWithWorkspace } from '@/lib/data/bootstrap';
import { seedDemoData } from '@/lib/data/demo';
import { todayIn } from '@/lib/finance/period';
import { checkRateLimit } from './rate-limit';
import { audit } from './session';

/**
 * Guest accounts: "Look around first" without signing up (App Store guideline
 * 5.1.1(v): don't make people register to see what an app does).
 *
 * A guest is an ordinary account flagged `is_guest`, so every screen works for real
 * (the real car list, real budgets, real splits) on sample money. It has no real
 * email and no usable password: the only way in is the session it was created with.
 * Creating a real account throws the guest away; anything left is purged after
 * GUEST_DAYS by /api/cron/purge-guests.
 */
export const GUEST_DAYS = 3;
const TIMEZONE = 'America/Toronto';

export type GuestResult = { ok: true; userId: string } | { ok: false; error: string; status: number };

export async function createGuest(ip: string | null): Promise<GuestResult> {
  // Each guest is a few hundred rows of sample data: bounded per address.
  const limit = await checkRateLimit(`guest:${ip ?? 'unknown'}`, 10, 60 * 60);
  if (!limit.allowed) return { ok: false, error: 'Lots of people are looking around from here. Try again in a little while, or create an account.', status: 429 };

  const { userId, workspaceIds } = await createUserWithWorkspace({
    // .invalid can never be a deliverable address, so no email is ever sent to it.
    email: `guest-${randomUUID()}@guest.pockit.invalid`,
    password: randomBytes(32).toString('base64url'),
    displayName: null,
    baseCurrency: 'CAD',
    timezone: TIMEZONE,
    kinds: ['personal'],
  });

  await withoutUser(async (tx) => {
    await tx.update(users).set({ isGuest: true }).where(eq(users.id, userId));
    // Straight to the app: the setup questions are for people keeping their data.
    await tx.update(userProfiles).set({ onboardingStage: 'done', onboardingCompletedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
  });
  await seedDemoData(userId, workspaceIds[0]!, todayIn(TIMEZONE));
  await audit({ action: 'guest.start', entity: 'user' });
  return { ok: true, userId };
}

/** Delete a guest. Does nothing to a real account, whatever is asked. */
export async function endGuest(userId: string): Promise<boolean> {
  const rows = await withoutUser((tx) => tx.delete(users)
    .where(and(eq(users.id, userId), eq(users.isGuest, true))).returning({ id: users.id }));
  return rows.length > 0;
}

/** Remove guests older than GUEST_DAYS. Cascades take their sample data with them. */
export async function purgeGuests(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - GUEST_DAYS * 86_400_000);
  const rows = await withoutUser((tx) => tx.delete(users)
    .where(and(eq(users.isGuest, true), lt(users.createdAt, cutoff))).returning({ id: users.id }));
  return rows.length;
}

/**
 * Guests may try Pock and receipt scanning, a few times a day. Each answer costs
 * real money at the AI provider, and a guest is anyone with a browser.
 */
export async function guestAiAllowed(user: { id: string; isGuest: boolean }): Promise<boolean> {
  if (!user.isGuest) return true;
  return (await checkRateLimit(`guest-ai:${user.id}`, 6, 24 * 60 * 60)).allowed;
}

export const GUEST_AI_LIMIT_MESSAGE = 'That’s the limit for looking around today. Create a free account to keep asking Pock.';
export const GUEST_BLOCKED_MESSAGE = 'Create a free account first. This works with your real money, so it isn’t part of looking around.';

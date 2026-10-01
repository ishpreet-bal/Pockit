import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { withoutUser } from '@/lib/db/client';
import { pockMessages, pockThreads, userProfiles } from '@/lib/db/schema';
import { env } from '@/lib/env';

/**
 * Pockit Plus.
 *
 * Everything that makes Pockit useful stays free. Plus pays for the parts that
 * cost real money to run per person — today that's Pock, which calls an AI model
 * for every answer. Free accounts get a few questions a month so they can see
 * what it's like; Plus is unlimited.
 */
export const FREE_POCK_QUESTIONS_PER_MONTH = 5;

/** Whether Plus exists yet. While it doesn't, nobody is limited. */
export function plusEnabled(): boolean {
  return env.PLUS_ENABLED === true;
}

export interface Plan {
  /** Whether Plus is switched on at all (the app hides every trace of it when not). */
  enabled: boolean;
  plus: boolean;
  plusUntil: Date | null;
  pockUsedThisMonth: number;
  /** Null when unlimited. */
  pockLeftThisMonth: number | null;
}

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getPlan(userId: string): Promise<Plan> {
  const [profile, used] = await Promise.all([
    withoutUser((tx) => tx.select({ plusUntil: userProfiles.plusUntil }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1)),
    // Questions asked, not answers received: a failed answer still counted against
    // the provider, but it shouldn't count against the person.
    withoutUser((tx) =>
      tx.select({ n: sql<number>`count(*)::int` })
        .from(pockMessages)
        .innerJoin(pockThreads, eq(pockThreads.id, pockMessages.threadId))
        .where(and(eq(pockThreads.userId, userId), eq(pockMessages.role, 'assistant'), gte(pockMessages.createdAt, monthStart()))),
    ),
  ]);
  const plusUntil = profile[0]?.plusUntil ?? null;
  const plus = plusUntil !== null && plusUntil.getTime() > Date.now();
  const pockUsedThisMonth = used[0]?.n ?? 0;
  const enabled = plusEnabled();
  return {
    enabled,
    plus,
    plusUntil,
    pockUsedThisMonth,
    // Before Plus launches, everyone is unlimited.
    pockLeftThisMonth: !enabled || plus ? null : Math.max(0, FREE_POCK_QUESTIONS_PER_MONTH - pockUsedThisMonth),
  };
}

export async function setPlus(userId: string, until: Date | null, source: string): Promise<boolean> {
  const rows = await withoutUser((tx) =>
    tx.update(userProfiles).set({ plusUntil: until, plusSource: source, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId)).returning({ userId: userProfiles.userId }),
  );
  return rows.length > 0;
}

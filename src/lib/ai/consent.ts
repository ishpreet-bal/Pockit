import 'server-only';
import { eq } from 'drizzle-orm';
import { withoutUser } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema';
import { getAiProvider } from '@/lib/ai';

/**
 * Asking before personal data goes to a third-party AI (App Store guideline
 * 5.1.2(i)). The server holds the answer and the AI routes check it, so nothing is
 * sent without a yes even if a screen is skipped. A yes is for one provider: after
 * switching AI_PROVIDER, people are asked again, because the company changed.
 */

/** The company that would receive the data, as people know it. Null without a real AI. */
export function aiCompany(): 'OpenAI' | 'Anthropic' | null {
  const name = getAiProvider().name;
  return name === 'openai' ? 'OpenAI' : name === 'anthropic' ? 'Anthropic' : null;
}

export async function hasAiConsent(userId: string): Promise<boolean> {
  const company = aiCompany();
  if (!company) return false;
  const rows = await withoutUser((tx) => tx.select({ at: userProfiles.aiConsentAt, provider: userProfiles.aiConsentProvider })
    .from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1));
  return Boolean(rows[0]?.at) && rows[0]?.provider === company;
}

export async function setAiConsent(userId: string, allow: boolean): Promise<void> {
  const company = aiCompany();
  await withoutUser((tx) => tx.update(userProfiles)
    .set(allow && company ? { aiConsentAt: new Date(), aiConsentProvider: company } : { aiConsentAt: null, aiConsentProvider: null })
    .where(eq(userProfiles.userId, userId)));
}

/** True when a real AI company is set up and this person hasn't allowed it. */
export async function aiConsentMissing(userId: string): Promise<boolean> {
  return aiCompany() !== null && !(await hasAiConsent(userId));
}

/** What a route answers when it would need the AI but has no yes. The app shows the question. */
export function consentNeeded() {
  const company = aiCompany();
  return {
    error: `Pock needs your OK before using ${company ?? 'AI'}. Allow it and try again.`,
    needsAiConsent: true,
    provider: company,
  };
}

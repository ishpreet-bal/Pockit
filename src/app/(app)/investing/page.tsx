import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/guard';
import { withUser } from '@/lib/db/client';
import { investorProfiles, watchlistItems } from '@/lib/db/schema';
import { getMarketProvider } from '@/lib/market/provider';
import { buildInvestorProfile, type InvestorAnswers } from '@/lib/finance/investing';
import { PageHeader } from '../page-header';
import { InvestingClient } from './investing-client';

export const metadata: Metadata = { title: 'Investing' };
export const dynamic = 'force-dynamic';

/**
 * The investing screen.
 *
 * The profile is always RE-DERIVED here from the stored answers rather than read
 * from the stored level. If the model that turns answers into a mix changes, an
 * existing profile updates with it instead of silently showing a conclusion the
 * current code would no longer reach.
 */
export default async function InvestingPage() {
  const { user, workspace } = await requireAuth();
  const provider = getMarketProvider();

  const [profileRow, watchlist] = await withUser(user.id, async (tx) => {
    const [p] = await tx.select().from(investorProfiles)
      .where(eq(investorProfiles.workspaceId, workspace.id)).limit(1);
    const w = await tx.select().from(watchlistItems)
      .where(eq(watchlistItems.workspaceId, workspace.id));
    return [p, w] as const;
  });

  const answers = (profileRow?.answers ?? null) as InvestorAnswers | null;
  const profile = answers ? buildInvestorProfile(answers) : null;

  const quotes = watchlist.length > 0
    ? await provider.quotes(watchlist.map((w) => w.symbol))
    : [];
  const quoteBySymbol = Object.fromEntries(quotes.map((q) => [q.symbol, q]));

  return (
    <>
      <PageHeader
        title="Investing"
        description="Work out what kind of investor you are, and keep an eye on what you are watching."
      />
      <div className="px-4 py-5 sm:px-6 lg:px-8">
        <InvestingClient
          profile={profile}
          answers={answers}
          watchlist={watchlist.map((w) => ({
            id: w.id,
            symbol: w.symbol,
            name: w.name,
            // bigint cannot cross to a client component; minor units stay exact as
            // a number far beyond any share price.
            priceMinor: quoteBySymbol[w.symbol] ? Number(quoteBySymbol[w.symbol]!.priceMinor) : null,
            changeBps: quoteBySymbol[w.symbol]?.changeBps ?? null,
            quoteCurrency: quoteBySymbol[w.symbol]?.currency ?? null,
          }))}
          providerLabel={provider.label}
          providerLive={provider.live}
        />
      </div>
    </>
  );
}

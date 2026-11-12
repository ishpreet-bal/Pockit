import { SectionNav } from './section-nav';
import { SearchCommand } from '@/components/market/search-command';
import { sourceInfo } from './data';
import { getSessionUser } from '@/lib/auth/session';
import { isAdminEmail } from '@/lib/billing/plan';
import { InvestingComingSoon } from './coming-soon';

/**
 * The Investing shell.
 *
 * Search sits in the header rather than on one page, because looking something up is
 * the action most likely to interrupt whatever you were doing — and the whole section
 * is meant to flow from discovering, to researching, to following, without a detour
 * back to a search page.
 */
export default async function InvestingLayout({ children }: { children: React.ReactNode }) {
  // Still being finished: only the people who run Pockit (ADMIN_EMAILS) can open it.
  const user = await getSessionUser();
  if (!isAdminEmail(user?.email)) return <InvestingComingSoon />;
  const source = sourceInfo();

  return (
    <div className="px-4 pb-6 pt-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="pk-display text-2xl font-bold tracking-tight">Investing</h1>
          <div data-tour="invest-search" className="w-full sm:w-auto"><SearchCommand className="w-full sm:w-[340px]" /></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
          <div data-tour="invest-sections" className="min-w-0"><SectionNav /></div>
          {!source.live ? (
            <span className="rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-2xs font-semibold text-[var(--warning)]">
              Sample prices — no market key connected
            </span>
          ) : null}
        </div>
      </header>

      <div className="pt-5">{children}</div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { Card, EmptyState, Badge, LinkButton } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { AddTransaction } from './add-transaction';
import { TransactionActions } from './transaction-actions';
import { todayIn, startOfMonth, endOfMonth } from '@/lib/finance/period';
import { isScheduled } from '@/lib/finance/position';
import { periodTotals } from '@/lib/finance/ledger';
import { toDecimalString, absMinor } from '@/lib/money';
import { cn } from '@/lib/ui/cn';
import type { LedgerTxn } from '@/lib/finance/types';

export const metadata: Metadata = { title: 'Transactions' };
export const dynamic = 'force-dynamic';

type View = 'this_month' | 'upcoming' | 'past' | 'all';

const VIEWS: { id: View; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Earlier' },
  { id: 'all', label: 'All' },
];

export default async function TransactionsPage({
  searchParams,
}: { searchParams: Promise<{ view?: string; q?: string; category?: string; account?: string }> }) {
  const { user, workspace } = await requireAuth();
  const params = await searchParams;
  const view = (VIEWS.some((v) => v.id === params.view) ? params.view : 'this_month') as View;

  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const cur = workspace.baseCurrency;

  const [all, categories, accounts] = await Promise.all([
    repo.listTransactions(), repo.listCategories(), repo.listAccounts(),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const query = params.q?.trim().toLowerCase() ?? '';
  const matches = (t: LedgerTxn) => {
    if (params.category && t.categoryId !== params.category) return false;
    if (params.account && t.accountId !== params.account) return false;
    if (!query) return true;
    const hay = `${t.description} ${t.merchantName ?? ''} ${categoryById.get(t.categoryId ?? '')?.name ?? ''}`.toLowerCase();
    return hay.includes(query);
  };

  const filtered = all.filter(matches);
  const upcomingAll = filtered.filter((t) => isScheduled(t, today));

  const visible = filtered.filter((t) => {
    switch (view) {
      case 'upcoming': return isScheduled(t, today);
      case 'this_month': return t.postedDate >= monthStart && t.postedDate <= monthEnd;
      case 'past': return t.postedDate < monthStart;
      default: return true;
    }
  });

  // In the month view, keep what is still to come visually separate from what has
  // already happened — the original problem was a planned bill being indistinguishable
  // from a paid one, and then impossible to find at all.
  const scheduled = visible.filter((t) => isScheduled(t, today))
    .sort((a, b) => a.postedDate.localeCompare(b.postedDate));
  const posted = visible.filter((t) => !isScheduled(t, today));

  const postedTotals = periodTotals(posted);
  const scheduledOut = scheduled.filter((t) => t.type !== 'income');

  const choices = categories.map((c) => ({
    id: c.id, name: c.name, icon: c.icon,
    parent: c.parentId ? categoryById.get(c.parentId)?.name ?? null : null,
    isPrimary: c.parentId === null,
  }));
  const accountChoices = accounts.map((a) => ({ id: a.id, name: a.name }));

  const empty = all.length === 0;

  return (
    <>
      <PageHeader
        title="Transactions"
        action={<AddTransaction accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))} categories={choices} today={today} />}
      >
        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-0.5" aria-label="Transaction view">
          {VIEWS.map((v) => {
            const count = v.id === 'upcoming' ? upcomingAll.length : null;
            const qs = new URLSearchParams({ ...(params.q ? { q: params.q } : {}), view: v.id });
            return (
              <Link
                key={v.id}
                href={`/transactions?${qs}`}
                aria-current={view === v.id ? 'page' : undefined}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
                  view === v.id
                    ? 'border-transparent bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
                )}
              >
                {v.label}
                {count ? <span className="ml-1.5 opacity-70">{count}</span> : null}
              </Link>
            );
          })}
        </nav>
      </PageHeader>

      <div className="space-y-5 px-4 py-4 sm:px-6">
        {empty ? (
          <Card>
            <EmptyState
              icon="≡"
              title="No transactions yet"
              description="Add your first transaction to start tracking your spending, or import a bank statement to bring in your history all at once."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <AddTransaction accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))} categories={choices} today={today} />
                  <LinkButton href="/imports/new">Import a file</LinkButton>
                </div>
              }
            />
          </Card>
        ) : (
          <>
            {view !== 'upcoming' && posted.length > 0 ? (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-[var(--text-muted)]">
                  In: <Money minor={postedTotals.income} currency={cur} size="sm" tone="plain" />
                </span>
                <span className="text-[var(--text-muted)]">
                  Out: <Money minor={postedTotals.expenses} currency={cur} size="sm" tone="plain" />
                </span>
                {scheduledOut.length > 0 ? (
                  <span className="text-[var(--text-muted)]">
                    Still to pay:{' '}
                    <Money minor={scheduledOut.reduce((s, t) => s + absMinor(t.baseAmountMinor), 0n)} currency={cur} size="sm" tone="plain" />
                  </span>
                ) : null}
              </div>
            ) : null}

            {scheduled.length > 0 ? (
              <section>
                <h2 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                  Scheduled
                  <span className="font-normal normal-case tracking-normal text-[var(--text-subtle)]">
                    · not paid yet
                  </span>
                </h2>
                <Card className="overflow-hidden">
                  <ul>
                    {scheduled.map((t) => (
                      <TxnRow
                        key={t.id} txn={t} upcoming today={today} locale={user.locale} currency={cur}
                        categoryById={categoryById} accountById={accountById}
                        categories={choices} accounts={accountChoices}
                      />
                    ))}
                  </ul>
                </Card>
              </section>
            ) : null}

            {posted.length > 0 ? (
              <section>
                {scheduled.length > 0 ? (
                  <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                    Completed
                  </h2>
                ) : null}
                <Card className="overflow-hidden">
                  <ul>
                    {posted.map((t) => (
                      <TxnRow
                        key={t.id} txn={t} today={today} locale={user.locale} currency={cur}
                        categoryById={categoryById} accountById={accountById}
                        categories={choices} accounts={accountChoices}
                      />
                    ))}
                  </ul>
                </Card>
              </section>
            ) : null}

            {visible.length === 0 ? (
              <Card>
                <EmptyState
                  title={
                    view === 'upcoming' ? 'Nothing scheduled yet'
                    : view === 'past' ? 'Nothing before this month'
                    : 'Nothing here yet'
                  }
                  description={
                    view === 'upcoming'
                      ? 'Add a transaction with a future date, or set up a recurring bill, and it will appear here before it happens.'
                      : 'Try another view, or clear your search.'
                  }
                  action={
                    view === 'upcoming'
                      ? <LinkButton href="/recurring" variant="primary">Set up a recurring bill</LinkButton>
                      : <LinkButton href="/transactions?view=all">Show all</LinkButton>
                  }
                />
              </Card>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function TxnRow({
  txn, upcoming, today, locale, currency, categoryById, accountById, categories, accounts,
}: {
  txn: LedgerTxn;
  upcoming?: boolean;
  today: string;
  locale: string;
  currency: string;
  categoryById: Map<string, { name: string; icon: string | null }>;
  accountById: Map<string, { name: string }>;
  categories: { id: string; name: string; icon: string | null; parent: string | null; isPrimary: boolean }[];
  accounts: { id: string; name: string }[];
}) {
  const cat = txn.categoryId ? categoryById.get(txn.categoryId) : null;
  const signed =
    txn.type === 'income' || txn.type === 'refund'
      ? absMinor(txn.baseAmountMinor)
      : txn.type === 'transfer' || txn.type === 'investment' || txn.type === 'debt_payment'
        ? txn.baseAmountMinor
        : -absMinor(txn.baseAmountMinor);

  const daysAway = upcoming
    ? Math.round((Date.parse(`${txn.postedDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
    : 0;

  return (
    <li className={cn(
      'flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-0',
      upcoming && 'bg-[var(--surface-2)]/50',
    )}>
      <div className="w-11 shrink-0 text-center">
        <div className="text-2xs uppercase tracking-wide text-[var(--text-subtle)]">
          {new Date(`${txn.postedDate}T12:00:00Z`).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' })}
        </div>
        <div className={cn('text-sm tabular', upcoming ? 'text-[var(--text-muted)]' : 'font-medium')}>
          {Number(txn.postedDate.slice(8, 10))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {txn.merchantName ?? txn.description}
          {upcoming ? (
            <Badge tone="info">
              {daysAway <= 0 ? 'due today' : daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`}
            </Badge>
          ) : null}
          {txn.isRecurring ? <Badge tone="neutral">repeats</Badge> : null}
        </p>
        <p className="truncate text-xs text-[var(--text-subtle)]">
          {cat ? cat.name : 'Uncategorised'}
          {' · '}
          {accountById.get(txn.accountId)?.name ?? ''}
        </p>
      </div>

      <div className={cn('shrink-0 text-right', upcoming && 'opacity-75')}>
        <Money minor={signed} currency={currency} size="sm" />
      </div>

      <TransactionActions
        currency={currency}
        categories={categories}
        accounts={accounts}
        txn={{
          id: txn.id,
          postedDate: txn.postedDate,
          description: txn.merchantName ?? txn.description,
          amountMajor: toDecimalString(absMinor(txn.baseAmountMinor), currency),
          type: txn.type,
          categoryId: txn.categoryId,
          accountId: txn.accountId,
          businessClassification: txn.businessClassification,
          isRecurring: txn.isRecurring,
        }}
      />
    </li>
  );
}


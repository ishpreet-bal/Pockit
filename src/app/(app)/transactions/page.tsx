import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader, PeriodFilter } from '../page-header';
import { Card, EmptyState, Table, Th, Td, Badge, LinkButton } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { resolvePeriod, todayIn, formatRange, type PeriodPreset } from '@/lib/finance/period';
import { periodTotals, spendingAmount, incomeAmount } from '@/lib/finance/ledger';
import { AddTransaction } from './add-transaction';

export const metadata: Metadata = { title: 'Transactions' };
export const dynamic = 'force-dynamic';

const TYPE_TONE = {
  income: 'positive', expense: 'neutral', transfer: 'info',
  refund: 'accent', investment: 'info', debt_payment: 'warning',
} as const;

export default async function TransactionsPage({
  searchParams,
}: { searchParams: Promise<{ period?: string; q?: string; type?: string; category?: string; account?: string }> }) {
  const { user, workspace } = await requireAuth();
  const params = await searchParams;
  const preset = (params.period ?? 'this_month') as PeriodPreset;

  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);
  const range = resolvePeriod(preset, today);

  const [all, categories, accounts] = await Promise.all([
    repo.listTransactions({ range }),
    repo.listCategories(),
    repo.listAccounts(),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const query = params.q?.trim().toLowerCase() ?? '';
  const filtered = all.filter((t) => {
    if (params.type && t.type !== params.type) return false;
    if (params.category && t.categoryId !== params.category) return false;
    if (params.account && t.accountId !== params.account) return false;
    if (query) {
      const haystack = `${t.description} ${t.merchantName ?? ''} ${categoryById.get(t.categoryId ?? '')?.name ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const totals = periodTotals(filtered);
  const cur = workspace.baseCurrency;

  return (
    <>
      <PageHeader
        title="Transactions"
        description={`${filtered.length} in ${formatRange(range, user.locale)}`}
        action={<AddTransaction accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
          categories={categories.filter((c) => !categories.some((x) => x.parentId === c.id)).map((c) => ({ id: c.id, name: c.name, icon: c.icon }))} />}
      >
        <PeriodFilter active={preset} />
      </PageHeader>

      <div className="space-y-4 px-4 py-4 sm:px-6">
        <form className="flex flex-wrap gap-2" role="search">
          <input type="hidden" name="period" value={preset} />
          <input
            name="q" defaultValue={params.q ?? ''} placeholder="Search merchant, description or category"
            aria-label="Search transactions"
            className="h-9 min-w-[200px] flex-1 rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm focus:border-[var(--accent)] focus:outline-none"
          />
          <select name="type" defaultValue={params.type ?? ''} aria-label="Type"
            className="h-9 rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm">
            <option value="">All types</option>
            {['expense', 'income', 'transfer', 'refund', 'investment', 'debt_payment'].map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
          <select name="account" defaultValue={params.account ?? ''} aria-label="Account"
            className="h-9 rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-sm">
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button type="submit" className="h-9 rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-medium hover:bg-[var(--surface-2)]">
            Filter
          </button>
        </form>

        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3"><p className="text-xs text-[var(--text-muted)]">Income</p><Money minor={totals.income} currency={cur} size="lg" tone="plain" /></Card>
          <Card className="p-3"><p className="text-xs text-[var(--text-muted)]">Spending</p><Money minor={totals.expenses} currency={cur} size="lg" tone="plain" /></Card>
          <Card className="p-3"><p className="text-xs text-[var(--text-muted)]">Net</p><Money minor={totals.netCashFlow} currency={cur} size="lg" /></Card>
        </div>

        <Card>
          {filtered.length === 0 ? (
            <EmptyState
              title="No transactions match"
              description="Try a wider date range, clear the filters, or import a statement to bring in history."
              action={<LinkButton href="/imports/new" variant="primary">Import a file</LinkButton>}
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th><Th>Description</Th><Th>Category</Th><Th>Account</Th><Th>Type</Th><Th numeric>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const cat = t.categoryId ? categoryById.get(t.categoryId) : null;
                  const acct = accountById.get(t.accountId);
                  // Sign for display: money in is positive, money out is negative,
                  // and transfers show their true direction on the account.
                  const display =
                    t.type === 'income' || t.type === 'refund' ? incomeAmount(t) || spendingAmount(t) * -1n
                    : t.type === 'transfer' || t.type === 'investment' || t.type === 'debt_payment' ? t.amountMinor
                    : -spendingAmount(t);
                  return (
                    <tr key={t.id} className="hover:bg-[var(--surface-2)]">
                      <Td className="whitespace-nowrap text-[var(--text-muted)]">
                        {new Date(`${t.postedDate}T12:00:00Z`).toLocaleDateString(user.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                      </Td>
                      <Td>
                        <span className="block max-w-[26ch] truncate sm:max-w-none">{t.merchantName ?? t.description}</span>
                        {t.isRecurring ? <span className="text-xs text-[var(--text-subtle)]">recurring</span> : null}
                      </Td>
                      <Td className="text-[var(--text-muted)]">
                        {cat ? <Link href={`/transactions?period=${preset}&category=${cat.id}`} className="hover:underline">{cat.icon} {cat.name}</Link> : '—'}
                      </Td>
                      <Td className="whitespace-nowrap text-[var(--text-muted)]">{acct?.name ?? '—'}</Td>
                      <Td><Badge tone={TYPE_TONE[t.type]}>{t.type.replace('_', ' ')}</Badge></Td>
                      <Td numeric><Money minor={display} currency={cur} size="sm" /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

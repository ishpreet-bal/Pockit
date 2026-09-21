import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { SectionTabs, BALANCES_TABS } from '@/components/ui/section-tabs';
import { Card, CardHeader, CardBody, EmptyState, Table, Th, Td, Badge, LinkButton } from '@/components/ui/primitives';
import { Money } from '@/components/finance/money';
import { Stat } from '@/components/finance/stat';
import { allAccountBalances, cashPosition } from '@/lib/finance/ledger';
import { computeNetWorth } from '@/lib/finance/networth';
import { todayIn } from '@/lib/finance/period';
import { formatMoney } from '@/lib/money';

export const metadata: Metadata = { title: 'Accounts' };
export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const today = todayIn(user.timezone);

  const [accounts, txns, assets, liabilities] = await Promise.all([
    repo.listAccounts(), repo.listTransactions(), repo.listAssets(), repo.listLiabilities(),
  ]);

  const balances = allAccountBalances(accounts, txns, today);
  const balanceById = new Map(balances.map((b) => [b.accountId, b]));
  const position = cashPosition(accounts, balances);
  const netWorth = computeNetWorth(
    accounts, balances,
    assets.map((a) => ({ id: a.id, name: a.name, category: a.category, valueMinor: BigInt(a.valueMinor as unknown as string), asOf: a.asOf, accountId: a.accountId })),
    liabilities.map((l) => ({ id: l.id, name: l.name, category: l.category, valueMinor: BigInt(l.balanceMinor as unknown as string), asOf: l.asOf, accountId: l.accountId })),
  );

  const cur = workspace.baseCurrency;
  const assetAccounts = accounts.filter((a) => a.normalBalance === 'debit');
  const accountAssetsMinor = assetAccounts.reduce(
    (sum, a) => sum + (balanceById.get(a.id)?.rawMinor ?? 0n), 0n,
  );
  const debtAccounts = accounts.filter((a) => a.normalBalance === 'credit');

  return (
    <>
      <PageHeader title="Accounts &amp; debts">
        <SectionTabs tabs={BALANCES_TABS} />
      </PageHeader>

      <div className="space-y-4 px-4 py-4 sm:px-6">
        {accounts.length === 0 ? (
          <Card>
            <EmptyState
              title="No accounts yet"
              description="Add a chequing account, a credit card or cash so transactions have somewhere to live."
              action={<LinkButton href="/onboarding" variant="primary">Set up accounts</LinkButton>}
            />
          </Card>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Cash" minor={position.cashMinor} currency={cur} hint="Chequing, savings and cash" />
              <Stat label="Debt" minor={position.debtMinor} currency={cur} hint="Cards, loans and lines of credit" />
              <Stat label="Assets" minor={netWorth.assetsMinor} currency={cur} hint="Including manual assets" />
              <Stat label="Net worth" minor={netWorth.netMinor} currency={cur} hint="Assets minus liabilities" />
            </section>

            <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardHeader title="Asset accounts" description="A positive balance is money you have" />
              <CardBody className="px-0 pb-0">
                <Table>
                  <thead><tr><Th>Account</Th><Th>Type</Th><Th>Institution</Th><Th numeric>Balance</Th></tr></thead>
                  <tbody>
                    {assetAccounts.map((a) => (
                      <tr key={a.id} className="hover:bg-[var(--surface-2)]">
                        <Td className="font-medium">{a.name}</Td>
                        <Td><Badge>{a.type.replace('_', ' ')}</Badge></Td>
                        <Td className="text-[var(--text-muted)]">{a.currency}</Td>
                        <Td numeric><Money minor={balanceById.get(a.id)?.rawMinor ?? 0n} currency={a.currency} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardBody>
            </Card>

            {debtAccounts.length > 0 ? (
              <Card>
                <CardHeader
                  title="Credit and loans"
                  description="A positive balance is money you owe. Payments to these accounts are transfers, not new spending."
                />
                <CardBody className="px-0 pb-0">
                  <Table>
                    <thead><tr><Th>Account</Th><Th>Type</Th><Th numeric>Owed</Th><Th numeric>Available credit</Th></tr></thead>
                    <tbody>
                      {debtAccounts.map((a) => {
                        const b = balanceById.get(a.id);
                        return (
                          <tr key={a.id} className="hover:bg-[var(--surface-2)]">
                            <Td className="font-medium">{a.name}</Td>
                            <Td><Badge tone="warning">{a.type.replace('_', ' ')}</Badge></Td>
                            <Td numeric><Money minor={b?.rawMinor ?? 0n} currency={a.currency} tone="plain" /></Td>
                            <Td numeric className="text-[var(--text-muted)]">
                              {b?.availableCreditMinor !== null && b?.availableCreditMinor !== undefined
                                ? formatMoney(b.availableCreditMinor, a.currency)
                                : '—'}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </CardBody>
              </Card>
            ) : null}
            </div>

            <aside className="space-y-4">
              <Card>
                <CardHeader title="Where your money sits" description="Share across the accounts listed here" />
                <CardBody className="space-y-3">
                  {assetAccounts.map((a, i) => {
                    const balance = balanceById.get(a.id)?.rawMinor ?? 0n;
                    // Divided by the accounts actually shown, not by total assets:
                    // assets include manually tracked holdings that have no row here,
                    // so using that denominator produced shares summing to 72%.
                    const share = accountAssetsMinor > 0n
                      ? Number((balance * 1000n) / accountAssetsMinor) / 10
                      : 0;
                    return (
                      <div key={a.id}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate">{a.name}</span>
                          <span className="tabular shrink-0 text-xs text-[var(--text-muted)]">
                            {share.toFixed(0)}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{ width: `${Math.max(0, Math.min(100, share))}%`, background: `var(--chart-${(i % 8) + 1})` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {assetAccounts.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">No asset accounts yet.</p>
                  ) : null}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="What this means" />
                <CardBody className="space-y-2.5 text-sm text-[var(--text-muted)]">
                  <p>
                    <strong className="text-[var(--text)]">Cash</strong> is what you can spend today.
                    <strong className="text-[var(--text)]"> Assets</strong> includes money you hold but
                    would have to sell or withdraw first.
                  </p>
                  <p>
                    Paying a credit card moves money between two of your own accounts, so it lowers your
                    debt without counting as new spending. That is why a card payment never appears in
                    your monthly total twice.
                  </p>
                  <p className="text-xs text-[var(--text-subtle)]">
                    Every balance here is derived from your opening balance plus every transaction — none
                    of them are typed in and left to drift.
                  </p>
                </CardBody>
              </Card>
            </aside>
            </div>
          </>
        )}
      </div>
    </>
  );
}

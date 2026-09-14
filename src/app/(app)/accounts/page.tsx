import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
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
  const debtAccounts = accounts.filter((a) => a.normalBalance === 'credit');

  return (
    <>
      <PageHeader title="Accounts" description="Balances are derived from your opening balance plus every transaction." />

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
          </>
        )}
      </div>
    </>
  );
}

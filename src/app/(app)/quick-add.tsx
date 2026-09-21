import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { todayIn } from '@/lib/finance/period';
import { AddTransaction } from './transactions/add-transaction';

/**
 * The floating quick-add, mounted once for the whole app.
 *
 * Logging a spend is the action people repeat most, and it was previously reachable
 * only from the transactions page — so the common case cost a navigation away from
 * whatever you were looking at. This puts the same form one tap from every screen.
 *
 * It renders nothing until an account exists: a transaction needs somewhere to go,
 * and offering a form that can only fail is worse than not offering it.
 */
export async function QuickAdd() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const [categories, accounts] = await Promise.all([repo.listCategories(), repo.listAccounts()]);

  if (accounts.length === 0) return null;

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const choices = categories.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    parent: c.parentId ? categoryById.get(c.parentId)?.name ?? null : null,
    isPrimary: c.parentId === null,
  }));

  return (
    <AddTransaction
      variant="fab"
      accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
      categories={choices}
      today={todayIn(user.timezone)}
    />
  );
}

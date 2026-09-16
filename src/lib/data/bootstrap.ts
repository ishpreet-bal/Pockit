import 'server-only';
import { eq, and } from 'drizzle-orm';
import { withoutUser, withUser } from '@/lib/db/client';
import {
  users, userProfiles, workspaces, workspaceMembers, categories, accounts, notificationRules,
} from '@/lib/db/schema';
import { DEFAULT_CATEGORIES, flattenCategories } from './default-categories';
import { hashPassword, normalizeEmail } from '@/lib/auth/password';

export interface BootstrapResult { userId: string; workspaceIds: string[] }

/**
 * Creates a user, their profile, their workspace(s) and the default category tree in
 * one transaction. Partial account creation would leave someone signed in with a
 * workspace that has no categories, which breaks every page.
 */
export async function createUserWithWorkspace(input: {
  email: string;
  password: string;
  displayName?: string | null;
  baseCurrency?: string;
  timezone?: string;
  kinds?: ('personal' | 'business')[];
}): Promise<BootstrapResult> {
  const email = input.email.trim();
  const normalized = normalizeEmail(email);
  const passwordHash = await hashPassword(input.password);
  const currency = input.baseCurrency ?? 'CAD';
  const timezone = input.timezone ?? 'America/Toronto';
  const kinds = input.kinds?.length ? input.kinds : (['personal'] as const);

  // The user row must exist before RLS can be bound to it, so it is created first.
  const created = await withoutUser(async (tx) => {
    const rows = await tx.insert(users).values({ email, emailNormalized: normalized, passwordHash })
      .returning({ id: users.id });
    const userId = rows[0]!.id;
    await tx.insert(userProfiles).values({
      userId,
      displayName: input.displayName ?? null,
      baseCurrency: currency,
      timezone,
    });
    return userId;
  });

  // Everything below is workspace data, so it runs bound to the new user and is
  // subject to the same RLS policies as every other write.
  const workspaceIds = await withUser(created, async (tx) => {
    const ids: string[] = [];
    for (const kind of kinds) {
      const wsRows = await tx.insert(workspaces).values({
        ownerUserId: created,
        name: kind === 'business' ? 'Business' : 'Personal',
        kind,
        baseCurrency: currency,
      }).returning({ id: workspaces.id });
      const workspaceId = wsRows[0]!.id;
      await tx.insert(workspaceMembers).values({ workspaceId, userId: created, role: 'owner' });
      await seedCategories(tx, workspaceId);
      await seedNotificationRules(tx, workspaceId);
      ids.push(workspaceId);
    }
    return ids;
  });

  return { userId: created, workspaceIds };
}

type Tx = Parameters<Parameters<typeof withUser>[1]>[0];

/** Insert the default tree, parents first so children can reference their ids. */
export async function seedCategories(tx: Tx, workspaceId: string): Promise<Map<string, string>> {
  const flat = flattenCategories(DEFAULT_CATEGORIES);
  const idBySlug = new Map<string, string>();

  for (const { seed, parentSlug, sortOrder } of flat) {
    const parentId = parentSlug ? idBySlug.get(parentSlug) ?? null : null;
    const rows = await tx.insert(categories).values({
      workspaceId,
      parentId,
      name: seed.name,
      slug: seed.slug,
      kind: seed.kind,
      classification: seed.classification,
      necessity: seed.necessity,
      icon: seed.icon,
      color: seed.color,
      isSystem: true,
      // Top-level categories are the first-choice picker; children stay behind "more".
      isPrimary: parentId === null,
      sortOrder,
    }).returning({ id: categories.id });
    idBySlug.set(seed.slug, rows[0]!.id);
  }

  return idBySlug;
}

const DEFAULT_NOTIFICATIONS = [
  'budget_approaching', 'budget_exceeded', 'upcoming_bill', 'goal_behind',
  'goal_achieved', 'large_expense', 'subscription_renewal',
];

async function seedNotificationRules(tx: Tx, workspaceId: string): Promise<void> {
  for (const kind of DEFAULT_NOTIFICATIONS) {
    await tx.insert(notificationRules).values({ workspaceId, kind, enabled: true }).onConflictDoNothing();
  }
}

/** Account type → normal balance. Getting this wrong breaks every balance in the app. */
export const ACCOUNT_NORMAL_BALANCE: Record<string, 'debit' | 'credit'> = {
  chequing: 'debit', savings: 'debit', cash: 'debit', investment: 'debit',
  business_chequing: 'debit', other: 'debit',
  credit_card: 'credit', line_of_credit: 'credit', loan: 'credit', mortgage: 'credit',
};

export async function createAccount(
  userId: string,
  workspaceId: string,
  input: {
    name: string;
    type: keyof typeof ACCOUNT_NORMAL_BALANCE;
    currency: string;
    openingBalanceMinor: bigint;
    openingBalanceDate: string;
    creditLimitMinor?: bigint | null;
    institution?: string | null;
  },
): Promise<string> {
  return withUser(userId, async (tx) => {
    const rows = await tx.insert(accounts).values({
      workspaceId,
      name: input.name,
      type: input.type as 'chequing',
      normalBalance: ACCOUNT_NORMAL_BALANCE[input.type] ?? 'debit',
      currency: input.currency,
      openingBalanceMinor: input.openingBalanceMinor,
      openingBalanceDate: input.openingBalanceDate,
      creditLimitMinor: input.creditLimitMinor ?? null,
      institution: input.institution ?? null,
    }).returning({ id: accounts.id });
    return rows[0]!.id;
  });
}

export async function findUserByEmail(email: string) {
  const rows = await withoutUser((tx) =>
    tx.select().from(users).where(and(eq(users.emailNormalized, normalizeEmail(email)))).limit(1),
  );
  return rows[0] ?? null;
}

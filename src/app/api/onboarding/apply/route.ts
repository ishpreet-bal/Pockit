import { NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser, withoutUser } from '@/lib/db/client';
import { userProfiles, recurringSeries, goals, accounts, categories, budgets, budgetAllocations } from '@/lib/db/schema';
import { startOfMonth, todayIn } from '@/lib/finance/period';
import {
  parseAnswers, buildPicture, toMonthlyMinor, toDbCadence, toIncomeSchedule, type Answers,
} from '@/lib/onboarding/state';
import { inferKind } from '@/lib/finance/goal-kinds';

export const dynamic = 'force-dynamic';

/**
 * Turn what they told us into real rows.
 *
 * "Setup complete" on its own is a broken promise — someone spent two minutes
 * answering questions and the app has to show it was worth doing. Each answer
 * becomes a real object the rest of Pockit already understands:
 *
 *   income          -> a recurring income series, which is what every cash-flow
 *                      calculation reads. Storing it only on the profile would make
 *                      the number visible in Settings and invisible everywhere else.
 *   recurring bills -> recurring series, status 'confirmed' because the person typed
 *                      them rather than the detector guessing.
 *   goals           -> goals, with the kind carried through so the analysis is
 *                      goal-specific from the first visit.
 *   savings         -> an opening balance on a savings account.
 *   spending        -> the first monthly budget, one line per category they picked.
 *
 * Idempotent by construction: it refuses to run once the stage is 'done', so a
 * double-submitted final screen cannot create two of everything.
 */
export async function POST() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const rows = await withoutUser((tx) =>
    tx.select({ stage: userProfiles.onboardingStage, answers: userProfiles.onboardingAnswers })
      .from(userProfiles).where(eq(userProfiles.userId, ctx.user.id)).limit(1),
  );
  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'No profile found.' }, { status: 404 });

  const answers = parseAnswers(row.answers);

  if (row.stage === 'done') {
    // Already applied. Return the picture so a refreshed final screen still renders.
    return NextResponse.json({ ok: true, alreadyApplied: true, picture: buildPicture(answers) });
  }

  // Claim the work atomically BEFORE doing it. Reading the stage and writing it
  // afterwards left a window in which a double-click, or "Skip" followed by the
  // final button, ran this twice and created every bill and income twice over.
  const claimed = await withoutUser((tx) =>
    tx.update(userProfiles)
      .set({ onboardingStage: 'done', onboardingCompletedAt: new Date() })
      .where(and(eq(userProfiles.userId, ctx.user.id), ne(userProfiles.onboardingStage, 'done')))
      .returning({ userId: userProfiles.userId }),
  );
  if (claimed.length === 0) {
    return NextResponse.json({ ok: true, alreadyApplied: true, picture: buildPicture(answers) });
  }

  const created = await withUser(ctx.user.id, async (tx) => {
    const counts = { recurring: 0, goals: 0, accounts: 0, budgetLines: 0 };

    // An account is needed before anything can point at one.
    const existing = await tx.select({ id: accounts.id, type: accounts.type })
      .from(accounts).where(eq(accounts.workspaceId, ctx.workspace.id));

    // A balance someone gives us is "right now", which already includes today's
    // spending — so it starts counting from tomorrow, or today would be counted twice.
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const opening = answers.chequingMinor !== undefined
      ? { openingBalanceMinor: BigInt(answers.chequingMinor), openingBalanceDate: tomorrow }
      : {};

    let chequingId = existing.find((a) => a.type === 'chequing')?.id ?? null;
    if (chequingId && answers.chequingMinor !== undefined) {
      await tx.update(accounts).set(opening).where(eq(accounts.id, chequingId));
    }
    if (!chequingId) {
      const made = await tx.insert(accounts).values({
        workspaceId: ctx.workspace.id,
        name: 'Everyday account',
        type: 'chequing',
        // An asset account increases on the debit side. Getting this wrong flips
        // the sign of every balance derived from it.
        normalBalance: 'debit',
        currency: ctx.workspace.baseCurrency,
        ...opening,
      }).returning({ id: accounts.id });
      chequingId = made[0]!.id;
      counts.accounts++;
    }

    if (answers.savingsMinor && answers.savingsMinor > 0 && !existing.some((a) => a.type === 'savings')) {
      await tx.insert(accounts).values({
        workspaceId: ctx.workspace.id,
        name: 'Savings',
        type: 'savings',
        normalBalance: 'debit',
        currency: ctx.workspace.baseCurrency,
        openingBalanceMinor: BigInt(answers.savingsMinor),
      });
      counts.accounts++;
    }

    if (answers.incomeMinor !== undefined && answers.incomeCadence) {
      await tx.insert(recurringSeries).values({
        workspaceId: ctx.workspace.id,
        name: 'Income',
        kind: 'income',
        type: 'income',
        // The column defaults to 'outflow'. Leaving it unset is how income showed
        // up as a negative expense.
        direction: 'inflow',
        startDate: answers.incomeNextDate ?? null,
        nextExpectedDate: answers.incomeNextDate ?? null,
        amountMinor: BigInt(answers.incomeMinor),
        currency: ctx.workspace.baseCurrency,
        cadence: toDbCadence(answers.incomeCadence),
        accountId: chequingId,
        // 'active', not 'candidate': the person typed this, so it is not a guess
        // waiting to be confirmed.
        status: 'active',
        isManual: true,
      });
      counts.recurring++;
    }

    for (const bill of answers.recurring ?? []) {
      await tx.insert(recurringSeries).values({
        workspaceId: ctx.workspace.id,
        name: bill.name,
        kind: 'subscription',
        type: 'expense',
        amountMinor: BigInt(bill.amountMinor),
        currency: ctx.workspace.baseCurrency,
        cadence: toDbCadence(bill.cadence),
        categoryId: bill.categoryId ?? null,
        accountId: chequingId,
        direction: 'outflow',
        startDate: bill.nextDate ?? null,
        nextExpectedDate: bill.nextDate ?? null,
        status: 'active',
        isManual: true,
      });
      counts.recurring++;
    }

    for (const goal of answers.goals ?? []) {
      // A goal with no target is still worth creating — it is a statement of intent,
      // and the app can ask for the number later. Zero is used as "not set yet",
      // which the goals screen already renders as "no target".
      await tx.insert(goals).values({
        workspaceId: ctx.workspace.id,
        name: goal.name || goal.kind.replace(/_/g, ' '),
        kind: inferKind(goal.name, goal.kind) as never,
        targetMinor: BigInt(goal.targetMinor ?? 0),
        currentMinor: BigInt(goal.currentMinor ?? 0),
        currency: ctx.workspace.baseCurrency,
        targetDate: goal.targetDate ?? null,
      });
      counts.goals++;
    }

    // "Where does most of your money go?" becomes the first budget, matched to this
    // workspace's own categories by slug (never by a shared id).
    const spend = Object.entries(answers.spendingByCategory ?? {}).filter(([, v]) => v > 0);
    if (spend.length) {
      const cats = await tx.select({ id: categories.id, slug: categories.slug })
        .from(categories).where(eq(categories.workspaceId, ctx.workspace.id));
      const bySlug = new Map(cats.map((cat) => [cat.slug, cat.id]));
      const lines = spend.flatMap(([slug, amount]) => (bySlug.has(slug) ? [{ categoryId: bySlug.get(slug)!, amount }] : []));
      if (lines.length) {
        await tx.update(budgets).set({ isActive: false })
          .where(and(eq(budgets.workspaceId, ctx.workspace.id), eq(budgets.isActive, true)));
        const made = await tx.insert(budgets).values({
          workspaceId: ctx.workspace.id,
          name: 'Monthly budget',
          method: 'category',
          period: 'monthly',
          periodStart: startOfMonth(todayIn(ctx.user.timezone)),
          rollover: false,
          setupAnswers: { createdFrom: 'setup' },
          isActive: true,
        }).returning({ id: budgets.id });
        await tx.insert(budgetAllocations).values(lines.map((l, i) => ({
          workspaceId: ctx.workspace.id,
          budgetId: made[0]!.id,
          categoryId: l.categoryId,
          amountMinor: BigInt(l.amount),
          sortOrder: i,
        })));
        counts.budgetLines = lines.length;
      }
    }

    return counts;
  });

  await withoutUser((tx) =>
    tx.update(userProfiles).set({
      onboardingStage: 'done',
      onboardingCompletedAt: new Date(),
      // Kept on the profile too, because Settings shows it and the onboarding
      // questionnaire is where it came from.
      ...(answers.incomeMinor !== undefined && answers.incomeCadence
        ? {
            approxIncomeMinor: BigInt(toMonthlyMinor(answers.incomeMinor, answers.incomeCadence)),
            incomeSchedule: toIncomeSchedule(answers.incomeCadence),
          }
        : {}),
      ...(answers.firstName ? { displayName: answers.firstName } : {}),
      ...(answers.intents?.length ? { primaryIntent: answers.intents[0] } : {}),
      updatedAt: new Date(),
    }).where(eq(userProfiles.userId, ctx.user.id)),
  );

  return NextResponse.json({ ok: true, created, picture: buildPicture(answers as Answers) });
}

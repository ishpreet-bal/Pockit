import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/guard';
import { withUser } from '@/lib/db/client';
import { imports, importCandidates, transactions } from '@/lib/db/schema';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../../../page-header';
import { ReviewQueue } from './review-queue';

export const metadata: Metadata = { title: 'Review import' };
export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, workspace } = await requireAuth();
  const { id } = await params;

  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);

  const [importRows, candidates, categories, accounts] = await Promise.all([
    withUser(user.id, (tx) =>
      tx.select().from(imports)
        .where(and(eq(imports.id, id), eq(imports.workspaceId, workspace.id)))
        .limit(1)),
    withUser(user.id, (tx) =>
      tx.select().from(importCandidates)
        .where(and(eq(importCandidates.importId, id), eq(importCandidates.workspaceId, workspace.id)))
        .orderBy(importCandidates.sortOrder)),
    repo.listCategories(),
    repo.listAccounts(),
  ]);

  const importRow = importRows[0];
  if (!importRow) notFound();

  // Duplicate rows reference an existing transaction; fetch those so the review UI
  // can show what it is a duplicate OF, not just that it is one.
  const duplicateIds = candidates
    .map((c) => c.duplicateOfTransactionId)
    .filter((v): v is string => Boolean(v));

  const existingById = new Map<string, { description: string; postedDate: string; amountMinor: string }>();
  if (duplicateIds.length > 0) {
    const rows = await withUser(user.id, (tx) =>
      tx.select({
        id: transactions.id, description: transactions.description,
        postedDate: transactions.postedDate, amountMinor: transactions.amountMinor,
      }).from(transactions).where(and(eq(transactions.workspaceId, workspace.id))),
    );
    for (const r of rows) {
      if (duplicateIds.includes(r.id)) {
        existingById.set(r.id, {
          description: r.description,
          postedDate: r.postedDate,
          amountMinor: String(r.amountMinor),
        });
      }
    }
  }

  const leafCategories = categories.filter((c) => !categories.some((x) => x.parentId === c.id));
  const parentName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        title="Review before saving"
        description={`${importRow.label ?? 'Import'} · ${importRow.candidateCount} found${importRow.duplicateCount > 0 ? ` · ${importRow.duplicateCount} possible duplicates` : ''}`}
      />
      <ReviewQueue
        importId={id}
        status={importRow.status}
        currency={workspace.baseCurrency}
        locale={user.locale}
        candidates={candidates.map((c) => ({
          id: c.id,
          postedDate: c.postedDate,
          description: c.description ?? '',
          merchantName: c.merchantName ?? '',
          amountMinor: c.amountMinor === null ? null : String(c.amountMinor),
          currency: c.currency,
          type: c.type,
          categoryId: c.categoryId,
          accountId: c.accountId,
          businessClassification: c.businessClassification,
          status: c.status,
          confidence: c.confidence,
          fieldConfidence: c.fieldConfidence as Record<string, number> | null,
          duplicateScore: c.duplicateScore,
          duplicateReasons: c.duplicateReasons as { scope?: string; confidence?: string; reasons?: { detail: string; points: number }[] } | null,
          duplicateOf: c.duplicateOfTransactionId ? existingById.get(c.duplicateOfTransactionId) ?? null : null,
          provenance: c.provenance as { sourceRef?: string | null; rawDate?: string; rawAmount?: string; dateAmbiguous?: boolean; typeReason?: string } | null,
          validationError: c.validationError,
        }))}
        categories={leafCategories.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          parent: c.parentId ? parentName.get(c.parentId) ?? null : null,
        }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { Card, EmptyState, Table, Th, Td, Badge, LinkButton } from '@/components/ui/primitives';
import { RollbackButton } from './rollback-button';

export const metadata: Metadata = { title: 'Imports' };
export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  pending: 'neutral', extracting: 'info', review: 'warning', committing: 'info',
  committed: 'positive', failed: 'negative', rolled_back: 'neutral',
} as const;

const STATUS_LABEL = {
  pending: 'Pending', extracting: 'Reading', review: 'Needs review', committing: 'Saving',
  committed: 'Imported', failed: 'Failed', rolled_back: 'Rolled back',
} as const;

export default async function ImportsPage() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const rows = await repo.listImports();

  return (
    <>
      <PageHeader
        title="Imports"
        description="Every import is recorded, and any import can be undone."
        action={<LinkButton href="/imports/new" variant="primary">New import</LinkButton>}
      />

      <div className="px-4 py-4 sm:px-6">
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              icon="↥"
              title="No imports yet"
              description="Upload a CSV, Excel file, PDF statement or screenshot. Pockit extracts the transactions, finds duplicates and shows you everything before saving any of it."
              action={<LinkButton href="/imports/new" variant="primary">Import a file</LinkButton>}
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>File</Th><Th>Source</Th><Th>Status</Th>
                  <Th numeric>Found</Th><Th numeric>Imported</Th><Th numeric>Duplicates</Th>
                  <Th>When</Th><Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--surface-2)]">
                    <Td>
                      <span className="block max-w-[28ch] truncate font-medium">{row.label ?? 'Untitled'}</span>
                      {row.errorDetail ? (
                        <span className="text-xs text-[var(--negative)]">{row.errorDetail}</span>
                      ) : null}
                    </Td>
                    <Td className="text-[var(--text-muted)]">{row.sourceKind.replace('_', ' ')}</Td>
                    <Td><Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge></Td>
                    <Td numeric>{row.candidateCount}</Td>
                    <Td numeric>{row.importedCount}</Td>
                    <Td numeric className={row.duplicateCount > 0 ? 'text-[var(--warning)]' : ''}>{row.duplicateCount}</Td>
                    <Td className="whitespace-nowrap text-[var(--text-muted)]">
                      {row.createdAt.toLocaleDateString(user.locale, { month: 'short', day: 'numeric' })}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        {row.status === 'review' ? (
                          <Link href={`/imports/${row.id}/review`} className="text-xs font-medium text-[var(--accent)] hover:underline">
                            Review →
                          </Link>
                        ) : null}
                        {row.status === 'committed' && row.importedCount > 0 ? (
                          <RollbackButton importId={row.id} count={row.importedCount} />
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../../page-header';
import { UploadForm } from './upload-form';
import { getAiProvider } from '@/lib/ai';

export const metadata: Metadata = { title: 'New import' };
export const dynamic = 'force-dynamic';

export default async function NewImportPage() {
  const { user, workspace } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);
  const accounts = await repo.listAccounts();
  const provider = getAiProvider();

  return (
    <>
      <PageHeader
        title="Import transactions"
        description="Nothing is saved until you have reviewed it."
      />
      <div className="px-4 py-4 sm:px-6">
        <UploadForm
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
          defaultRetention={user.fileRetention}
          capabilities={{ vision: provider.capabilities.vision, label: provider.capabilities.label }}
        />
      </div>
    </>
  );
}

import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { WorkspaceRepo } from '@/lib/data/repository';
import { PageHeader } from '../page-header';
import { ResetWorkspace } from './reset-workspace';
import { DemoBanner } from '../demo-banner';
import { Card, CardHeader, CardBody } from '@/components/ui/primitives';
import { SettingsForms } from './forms';
import { getAiProvider } from '@/lib/ai';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { user, workspace, workspaces } = await requireAuth();
  const repo = new WorkspaceRepo(user.id, workspace.id, workspace.baseCurrency);

  const [categories, rules] = await Promise.all([
    repo.listCategories(), repo.listMerchantRules(),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const provider = getAiProvider();

  return (
    <>
      <PageHeader title="Settings" description={`Signed in as ${user.email}`} />

      {/*
        Two columns on a wide screen. Settings is a long list of unrelated panels, and
        stacking them in a 768px strip left two thirds of a desktop empty while making
        the page twice as long to scroll.
      */}
      <div className="grid gap-4 px-4 py-5 sm:px-6 lg:grid-cols-2 lg:px-8 xl:gap-5">
        <div className="space-y-4 lg:col-span-2">
          {workspace.isDemo ? <DemoBanner /> : null}
        </div>

        <div className="space-y-4 lg:col-span-2">
        <SettingsForms
          profile={{
            displayName: user.displayName,
            baseCurrency: user.baseCurrency,
            timezone: user.timezone,
            locale: user.locale,
            fileRetention: user.fileRetention,
            aiEnabled: user.aiEnabled,
          }}
          categories={categories
            .filter((c) => c.kind === 'expense')
            .map((c) => ({
              id: c.id,
              name: c.name,
              icon: c.icon,
              parent: c.parentId ? categoryById.get(c.parentId)?.name ?? null : null,
              classification: c.classification,
              necessity: c.necessity,
            }))}
          rules={rules.map((r) => ({
            id: r.id,
            pattern: r.pattern,
            matchType: r.matchType,
            source: r.source,
            timesApplied: r.timesApplied,
            categoryName: r.categoryId ? categoryById.get(r.categoryId)?.name ?? null : null,
          }))}
          aiProviderLabel={provider.capabilities.label}
          aiConfigured={provider.capabilities.vision || provider.capabilities.tools}
        />
        </div>

        <Card>
          <CardHeader title="What is sent to an AI provider" description="Spec-mandated disclosure, kept accurate" />
          <CardBody className="space-y-2 text-sm text-[var(--text-muted)]">
            <p><strong className="text-[var(--text)]">Currently active:</strong> {provider.capabilities.label}</p>
            <ul className="list-inside list-disc space-y-1">
              <li>CSV, Excel and text-based PDF files are parsed on this server and are <strong>never</strong> sent to an AI provider.</li>
              <li>Screenshots and scanned PDFs are sent as the file itself, to extract the transactions in it.</li>
              <li>The assistant sends your question and the <strong>results of the specific queries</strong> it runs — never your full transaction history.</li>
              <li>Your email address, password and account numbers are never sent.</li>
            </ul>
            <p className="pt-1 text-xs text-[var(--text-subtle)]">
              Every model call is recorded with its token count and latency, so cost and behaviour can be audited.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Workspaces" />
          <CardBody>
            <ul className="space-y-1.5">
              {workspaces.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: w.kind === 'business' ? '#7d5ba6' : 'var(--accent)' }} />
                    {w.name}
                    {w.isDemo ? <span className="text-xs text-[var(--text-subtle)]">demo data</span> : null}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{w.baseCurrency} · {w.role}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--text-subtle)]">
              Transactions never move between workspaces. A combined view is an explicit choice, never a default.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Deployment" />
          <CardBody className="space-y-1 text-sm text-[var(--text-muted)]">
            <p>Storage driver: <strong className="text-[var(--text)]">{env.STORAGE_DRIVER}</strong></p>
            <p>Uploads are capped at <strong className="text-[var(--text)]">{env.MAX_UPLOAD_MB} MB</strong>.</p>
            <p className="pt-1 text-xs text-[var(--text-subtle)]">
              Uploaded files are private to your workspace and served only through an authenticated route. There is no
              public bucket and no guessable URL.
            </p>
          </CardBody>
        </Card>

        {/* Last on the page on purpose: the one irreversible control should not sit
            above things people visit routinely. */}
        <div className="lg:col-span-2">
          <ResetWorkspace workspaceName={workspace.name} />
        </div>
      </div>
    </>
  );
}

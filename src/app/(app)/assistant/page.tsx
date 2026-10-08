import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guard';
import { PageHeader } from '../page-header';
import { getAiProvider } from '@/lib/ai';
import { AssistantChat } from './chat';
import { Card, EmptyState, LinkButton } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Assistant' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  const { user, workspace } = await requireAuth();
  const provider = getAiProvider();

  if (!provider.capabilities.tools) {
    return (
      <>
        <PageHeader title="Assistant" />
        <div className="px-4 py-8 sm:px-6">
          <Card>
            <EmptyState
              icon="✦"
              title="The assistant needs an AI provider"
              description="Add an ANTHROPIC_API_KEY or OPENAI_API_KEY to your environment and the assistant will answer questions using real queries against your ledger — every number it gives comes from a query you can open and check. Everything else in Pockit works without a key."
              action={<LinkButton href="/overview" variant="primary">Back to overview</LinkButton>}
            />
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Assistant"
        description={`Answers come from queries against your ${workspace.name.toLowerCase()} records, not from the model's memory.`}
      />
      <AssistantChat currency={workspace.baseCurrency} providerLabel={provider.capabilities.label} aiEnabled={user.aiEnabled} />
    </>
  );
}

import { Card, EmptyState, LinkButton } from '@/components/ui/primitives';
import { PageHeader } from './page-header';

/**
 * An honest placeholder. The spec explicitly asks not to create fake functionality,
 * so these pages say what is already built underneath and what is not yet wired up.
 */
export function ComingSoon({
  title, description, engineNote,
}: { title: string; description: string; engineNote: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="px-4 py-8 sm:px-6">
        <Card>
          <EmptyState
            title={description}
            description={engineNote}
            action={<LinkButton href="/overview" variant="primary">Back to overview</LinkButton>}
          />
        </Card>
      </div>
    </>
  );
}

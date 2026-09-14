import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { WorkspaceRepo } from '@/lib/data/repository';
import { commitImport } from '@/lib/import/commit';
import { audit } from '@/lib/auth/session';

export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;

  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  try {
    const result = await commitImport(repo, id);
    await audit({
      actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
      action: 'import.commit', entity: 'import', entityId: id,
      metadata: { imported: result.imported, failed: result.failed.length },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Commit failed' },
      { status: 400 },
    );
  }
}

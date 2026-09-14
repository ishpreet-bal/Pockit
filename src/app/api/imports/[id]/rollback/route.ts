import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { WorkspaceRepo } from '@/lib/data/repository';
import { rollbackImport } from '@/lib/import/commit';
import { audit } from '@/lib/auth/session';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;

  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  try {
    const result = await rollbackImport(repo, id);
    await audit({
      actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
      action: 'import.rollback', entity: 'import', entityId: id,
      metadata: { removed: result.removed },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Rollback failed' },
      { status: 400 },
    );
  }
}

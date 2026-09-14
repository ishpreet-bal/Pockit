import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { WorkspaceRepo } from '@/lib/data/repository';
import { ingestFile } from '@/lib/import/pipeline';
import { AiUnavailableError } from '@/lib/ai';
import { env } from '@/lib/env';
import { todayIn, audit } from '@/lib/import/deps';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export const maxDuration = 60;

const ALLOWED_MIME = [
  'text/csv', 'text/plain', 'text/tab-separated-values', 'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic',
];

export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  // AI extraction costs money per call, so uploads are rate limited per user.
  const limit = await checkRateLimit(`upload:${ctx.user.id}`, 40, 60 * 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many uploads in the last hour. Please try again later.' }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file was received.' }, { status: 400 });
  }

  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${env.MAX_UPLOAD_MB} MB.` },
      { status: 413 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  }

  const mime = file.type || 'application/octet-stream';
  const looksAllowed = ALLOWED_MIME.includes(mime) || /\.(csv|tsv|txt|xlsx|xls|pdf|png|jpe?g|webp)$/i.test(file.name);
  if (!looksAllowed) {
    return NextResponse.json(
      { error: `Files of type "${mime}" are not supported. Upload a CSV, Excel, PDF or image.` },
      { status: 415 },
    );
  }

  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const accountId = (form?.get('accountId') as string | null) || null;
  const dateFormatHint = (form?.get('dateFormatHint') as string | null) ?? 'unknown';
  const businessClassification = (form?.get('businessClassification') as string | null) ?? 'personal';
  const retention = (form?.get('retention') as string | null) ?? ctx.user.fileRetention;

  try {
    const result = await ingestFile(
      repo,
      { filename: file.name, mime, bytes: Buffer.from(await file.arrayBuffer()) },
      {
        accountId,
        dateFormatHint: dateFormatHint as 'dmy' | 'mdy' | 'ymd' | 'unknown',
        businessClassification: businessClassification === 'business' ? 'business' : 'personal',
        retention: retention as 'keep',
      },
      todayIn(ctx.user.timezone),
    );

    await audit({
      actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
      action: 'import.upload', entity: 'import', entityId: result.importId,
      metadata: { filename: file.name, candidates: result.candidateCount },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The file could not be processed.' },
      { status: 500 },
    );
  }
}

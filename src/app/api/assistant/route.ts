import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { WorkspaceRepo } from '@/lib/data/repository';
import { getAiProvider, AiUnavailableError } from '@/lib/ai';
import { buildAssistantTools } from '@/lib/ai/tools';
import { withUser } from '@/lib/db/client';
import { aiExtractions } from '@/lib/db/schema';
import { todayIn } from '@/lib/finance/period';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export const maxDuration = 60;

const schema = z.object({
  question: z.string().trim().min(1).max(1000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(12).default([]),
});

export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  if (!ctx.user.aiEnabled) {
    return NextResponse.json(
      { error: 'AI features are turned off for your account. You can enable them in Settings.' },
      { status: 403 },
    );
  }

  const limit = await checkRateLimit(`assistant:${ctx.user.id}`, 60, 60 * 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many questions in the last hour. Please try again later.' }, { status: 429 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const provider = getAiProvider();
  if (!provider.capabilities.tools) {
    return NextResponse.json(
      {
        error:
          'The assistant needs an AI provider that supports tool use. Add an ANTHROPIC_API_KEY to enable it. ' +
          'Everything else in Pockit works without one.',
      },
      { status: 503 },
    );
  }

  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const today = todayIn(ctx.user.timezone);

  try {
    const response = await provider.answerQuestion({
      question: parsed.data.question,
      history: parsed.data.history,
      tools: buildAssistantTools(repo, today, ctx.workspace.baseCurrency),
      currency: ctx.workspace.baseCurrency,
      today,
    });

    await withUser(ctx.user.id, (tx) =>
      tx.insert(aiExtractions).values({
        workspaceId: ctx.workspace.id,
        provider: response.usage.provider,
        model: response.usage.model,
        operation: 'assistant',
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        latencyMs: response.usage.latencyMs,
        status: 'ok',
      }),
    );

    return NextResponse.json({
      answer: response.data.answer,
      grounded: response.data.grounded,
      // The tool calls are returned so the user can see exactly which query produced
      // the figure, and open it themselves.
      toolCalls: response.data.toolCalls.map((c) => ({
        name: c.name,
        input: c.input,
        drilldown: (c.result as { drilldown?: string } | null)?.drilldown ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The assistant could not answer that.' },
      { status: 500 },
    );
  }
}

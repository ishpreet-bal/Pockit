import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { requireAuthApi } from '@/lib/auth/api';
import { withUser } from '@/lib/db/client';
import { pockThreads, pockMessages } from '@/lib/db/schema';
import { getAiProvider } from '@/lib/ai';
import { AiUnavailableError } from '@/lib/ai/types';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { POCK_BRIEF, composeTurn } from '@/lib/pock/brief';
import { relevantTo, renderHelp } from '@/lib/pock/knowledge';
import { buildUserContext } from '@/lib/pock/context';
import { buildContext as buildMarketContext } from '@/lib/investing/pock';
import { todayIn } from '@/lib/finance/period';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** How many earlier turns are replayed. Enough to follow a thread, bounded for cost. */
const HISTORY_TURNS = 12;

/** Past conversations, newest first — or one thread in full. */
export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const threadId = new URL(request.url).searchParams.get('thread')?.trim() ?? '';

  if (threadId === '') {
    const threads = await withUser(ctx.user.id, (tx) =>
      tx.select({
        id: pockThreads.id, title: pockThreads.title,
        symbol: pockThreads.symbol, updatedAt: pockThreads.updatedAt,
      })
        .from(pockThreads)
        .where(eq(pockThreads.workspaceId, ctx.workspace.id))
        .orderBy(desc(pockThreads.updatedAt))
        .limit(25),
    );
    return NextResponse.json({ threads });
  }

  const messages = await withUser(ctx.user.id, (tx) =>
    tx.select({ id: pockMessages.id, role: pockMessages.role, body: pockMessages.body, createdAt: pockMessages.createdAt })
      .from(pockMessages)
      .where(and(eq(pockMessages.threadId, threadId), eq(pockMessages.workspaceId, ctx.workspace.id)))
      .orderBy(asc(pockMessages.createdAt)),
  );
  return NextResponse.json({ messages });
}

const askSchema = z.object({
  question: z.string().trim().min(2, 'Ask a question.').max(2000),
  threadId: z.string().uuid().optional(),
  /** Set when asking from an asset page, so "is this expensive?" has a subject. */
  symbol: z.string().trim().max(12).optional(),
  /**
   * What the person was looking at when they asked.
   *
   * This is what makes "Ask Pock about this goal" work without them re-explaining
   * which goal. It is a subject, not an instruction — the anchor widens which data
   * is fetched, and never tells the model what to conclude.
   */
  anchor: z.object({
    kind: z.enum(['goal', 'symbol', 'budget', 'spending']),
    id: z.string().max(64).optional(),
    label: z.string().max(120).optional(),
  }).optional(),
});

/**
 * Ask Pock something.
 *
 * The answer is grounded in a fact sheet built from this workspace's real position
 * plus any market figures fetched for the question — see lib/investing/pock.ts.
 * Both the answer and the facts it was given are stored, so a claim made months ago
 * can still be checked against what was actually known at the time.
 */
export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const limit = await checkRateLimit(`pock:${ctx.user.id}`, 40, 60 * 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'That is a lot of questions in one hour. Try again a little later.' },
      { status: 429 },
    );
  }

  const parsed = askSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Ask a question.' }, { status: 400 });
  }
  const { question, symbol, anchor } = parsed.data;

  const provider = getAiProvider();

  const prepared = await withUser(ctx.user.id, async (tx) => {
    let threadId = parsed.data.threadId ?? null;

    if (threadId) {
      const owned = await tx.select({ id: pockThreads.id }).from(pockThreads)
        .where(and(eq(pockThreads.id, threadId), eq(pockThreads.workspaceId, ctx.workspace.id))).limit(1);
      if (owned.length === 0) threadId = null;
    }

    if (!threadId) {
      const created = await tx.insert(pockThreads).values({
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
        // The first question is the title. It is what the person will recognise the
        // conversation by, which a generated summary rarely is.
        title: question.slice(0, 80),
        symbol: (symbol ?? (anchor?.kind === 'symbol' ? anchor.id : null))?.toUpperCase() ?? null,
      }).returning({ id: pockThreads.id });
      threadId = created[0]!.id;
    }

    const history = await tx.select({ role: pockMessages.role, body: pockMessages.body })
      .from(pockMessages)
      .where(eq(pockMessages.threadId, threadId))
      .orderBy(asc(pockMessages.createdAt))
      .limit(HISTORY_TURNS);

    // Three separate retrievals, assembled rather than concatenated blindly:
    // how the app works, what this person's figures are, and — only when an
    // instrument is involved — live market data.
    const help = renderHelp(relevantTo(question));
    const user = await buildUserContext(tx, {
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      currency: ctx.workspace.baseCurrency,
      timezone: 'UTC',
      today: todayIn('UTC'),
      question,
      anchor: anchor ?? (symbol ? { kind: 'symbol' as const, id: symbol } : null),
    });

    const wantsMarket = user.slices.includes('investments') || Boolean(symbol);
    const market = wantsMarket
      ? await buildMarketContext(tx, ctx.workspace.id, question, symbol ?? anchor?.id ?? null)
      : null;

    const context = {
      factSheet: composeTurn({
        help,
        userContext: [user.text, market?.factSheet ?? ''].filter(Boolean).join('\n\n'),
        question,
      }),
      facts: { ...user.facts, ...(market?.facts ?? {}), slices: user.slices, helpUsed: relevantTo(question).map((h) => h.id) },
      symbols: market?.symbols ?? [],
    };

    await tx.insert(pockMessages).values({
      threadId, workspaceId: ctx.workspace.id, role: 'user', body: question,
    });

    return { threadId, history, context };
  });

  // The facts go in with the CURRENT question rather than in the system brief, so
  // that a figure fetched three turns ago cannot be mistaken for a figure fetched
  // now. Each turn carries the data it was actually answered from.
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...prepared.history.map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.body,
    })),
    { role: 'user', content: prepared.context.factSheet },
  ];

  let answer: string;
  let model: string | null = null;
  try {
    const response = await provider.converse({ brief: POCK_BRIEF, messages, maxTokens: 900 });
    answer = response.data.trim();
    model = response.usage?.model ?? null;
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json({
        error: 'Pock cannot answer questions yet — this deployment has no AI provider configured. ' +
          'Everything else in the investing section works without one.',
        threadId: prepared.threadId,
        configured: false,
      }, { status: 503 });
    }
    throw error;
  }

  if (answer === '') {
    return NextResponse.json({ error: 'Pock had nothing to say. Try asking it differently.' }, { status: 502 });
  }

  await withUser(ctx.user.id, async (tx) => {
    await tx.insert(pockMessages).values({
      threadId: prepared.threadId,
      workspaceId: ctx.workspace.id,
      role: 'assistant',
      body: answer,
      facts: prepared.context.facts,
      model,
    });
    await tx.update(pockThreads).set({ updatedAt: new Date() }).where(eq(pockThreads.id, prepared.threadId));
  });

  return NextResponse.json({
    threadId: prepared.threadId,
    answer,
    symbols: prepared.context.symbols,
  });
}

/** Forget a conversation. Messages go with it, by cascade. */
export async function DELETE(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const id = new URL(request.url).searchParams.get('thread')?.trim() ?? '';
  if (id === '') return NextResponse.json({ error: 'Pass a thread id.' }, { status: 400 });

  await withUser(ctx.user.id, (tx) =>
    tx.delete(pockThreads).where(and(eq(pockThreads.id, id), eq(pockThreads.workspaceId, ctx.workspace.id))),
  );
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { requireAuthApi } from '@/lib/auth/api';
import { getAiProvider } from '@/lib/ai';
import { AiUnavailableError } from '@/lib/ai/types';
import { describeProviderError } from '@/lib/ai/errors';
import { POCK_BRIEF } from '@/lib/pock/brief';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Is the AI provider actually answering?
 *
 * Same reasoning as the market-data check: a missing key and a rejected key look
 * identical from the outside — Pock declines to answer either way — so "I set
 * an API key and nothing changed" had no answer. This makes one real,
 * deliberately tiny model call and reports what came back.
 *
 * It never returns the key, or any part of it.
 */
export async function GET() {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const provider = getAiProvider();
  const configured = Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());

  const started = Date.now();
  try {
    const response = await provider.converse({
      brief: POCK_BRIEF,
      // A question with one correct answer and no data, so a wrong reply is obvious
      // and the call costs almost nothing.
      messages: [{ role: 'user', content: 'Reply with exactly the word: ready' }],
      maxTokens: 16,
    });

    return NextResponse.json({
      ok: true,
      configured,
      provider: response.usage?.provider ?? 'unknown',
      model: response.usage?.model ?? null,
      ms: Date.now() - started,
      reply: response.data.slice(0, 40),
      problems: [],
    });
  } catch (error) {
    const unavailable = error instanceof AiUnavailableError;

    return NextResponse.json({
      ok: false,
      configured,
      provider: provider.capabilities.label,
      model: null,
      ms: Date.now() - started,
      reply: null,
      problems: [
        unavailable && !configured
          ? 'No AI provider is configured on this deployment, so Pock cannot answer questions. Everything else works without one.'
          : unavailable
            ? 'An AI key is set on this deployment but the app is still falling back to on-device parsing. Check AI_PROVIDER is "auto", or names the provider whose key you set ("anthropic" for ANTHROPIC_API_KEY, "openai" for OPENAI_API_KEY), and that the variable is not saved with quotes around it.'
            // The provider's own message is the most useful thing here — it
            // distinguishes an invalid key from a spent quota from a wrong model id.
            : describeProviderError(error).detail,
      ],
    });
  }
}

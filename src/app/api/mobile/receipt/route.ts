import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { requireAuthApi } from '@/lib/auth/api';
import { env } from '@/lib/env';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Read a receipt photo: store, total, date and a likely category, so adding a
 * purchase is one photo. The photo is sent to Claude and not kept.
 */

const Receipt = z.object({
  isReceipt: z.boolean().describe('false if the photo is not a receipt or bill'),
  merchant: z.string().describe('store or business name as a person would say it, e.g. "No Frills"'),
  total: z.number().describe('the final amount paid including tax and tip, in dollars'),
  date: z.string().describe('purchase date as YYYY-MM-DD, or empty if not shown'),
  category: z.string().describe('one of the provided category names, or empty'),
});

const body = z.object({
  image: z.string().min(100).max(8_000_000),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
  categories: z.array(z.string().max(40)).max(60).default([]),
});

export async function POST(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;
  if (!env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Receipt scanning isn’t switched on yet.' }, { status: 503 });
  const limit = await checkRateLimit(`receipt:${ctx.user.id}`, 30, 60 * 60);
  if (!limit.allowed) return NextResponse.json({ error: 'That’s a lot of receipts — try again in a bit.' }, { status: 429 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'That photo couldn’t be read. Try a clearer one.' }, { status: 400 });
  const { image, mediaType, categories } = parsed.data;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  try {
    const response = await client.messages.parse({
      model: env.AI_MODEL ?? 'claude-opus-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(Receipt) },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: `Read this receipt. Categories to choose from: ${categories.join(', ') || 'none given'}. Today is ${new Date().toISOString().slice(0, 10)}.` },
        ],
      }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return NextResponse.json({ error: 'Couldn’t read that receipt. Try a straighter, brighter photo.' }, { status: 422 });
    }
    const r = response.parsed_output;
    if (!r.isReceipt) return NextResponse.json({ error: 'That doesn’t look like a receipt.' }, { status: 422 });
    return NextResponse.json({
      merchant: r.merchant.trim(),
      amount: Math.round(r.total * 100) / 100,
      date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
      category: categories.includes(r.category) ? r.category : null,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'Busy right now — try again in a minute.' }, { status: 429 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: 'Receipt reading failed. Add it by hand for now.' }, { status: 502 });
    throw e;
  }
}

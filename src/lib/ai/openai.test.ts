import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import { OpenAiProvider } from './openai';
import { describeProviderError } from './errors';
import { AiUnavailableError } from './types';

/**
 * The real SDK against a fake network, so what is checked is the request OpenAI
 * would actually receive and how a real-shaped response is read back.
 */
function withFakeApi(replies: unknown[]) {
  const requests: Record<string, unknown>[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    const reply = replies.shift();
    if (!reply) throw new Error('No more fake replies');
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const provider = new OpenAiProvider('sk-test', 'gpt-test');
  (provider as unknown as { client: OpenAI }).client = new OpenAI({ apiKey: 'sk-test', fetch, maxRetries: 0 });
  return { provider, requests };
}

const response = (output: unknown[]) => ({
  id: 'resp_1', object: 'response', created_at: 0, status: 'completed', model: 'gpt-test',
  output, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
});
const message = (text: string) => ({
  type: 'message', id: 'msg_1', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text, annotations: [] }],
});
const call = (name: string, args: unknown, id = 'call_1') => ({
  type: 'function_call', id: `fc_${id}`, call_id: id, name, arguments: JSON.stringify(args), status: 'completed',
});

describe('OpenAiProvider', () => {
  it('runs a tool, sends the result back, and grounds the answer in it', async () => {
    const { provider, requests } = withFakeApi([
      response([{ type: 'reasoning', id: 'rs_1', summary: [] }, call('spending_total', { category: 'Groceries' })]),
      response([message('You spent $412.50 on groceries.')]),
    ]);
    const seen: unknown[] = [];

    const result = await provider.answerQuestion({
      question: 'How much on groceries?',
      currency: 'CAD',
      today: '2026-10-08',
      tools: [{
        name: 'spending_total',
        description: 'Total spending',
        inputSchema: { type: 'object', properties: { category: { type: 'string' } } },
        run: async (input) => { seen.push(input); return { total: '412.50' }; },
      }],
    });

    expect(seen).toEqual([{ category: 'Groceries' }]);
    expect(result.data.answer).toBe('You spent $412.50 on groceries.');
    expect(result.data.grounded).toBe(true);
    expect(result.usage).toMatchObject({ inputTokens: 20, outputTokens: 10, provider: 'openai', model: 'gpt-test' });

    // The second request replays the reasoning and the call, in order, then the result.
    const second = requests[1]!.input as { type?: string; call_id?: string; output?: string }[];
    expect(second.map((i) => i.type)).toEqual([undefined, 'reasoning', 'function_call', 'function_call_output']);
    expect(second[3]).toMatchObject({ call_id: 'call_1', output: '{"total":"412.50"}' });
    expect(requests[0]!.tools).toEqual([expect.objectContaining({ type: 'function', name: 'spending_total', strict: false })]);
  });

  it('marks an answer that used no tool as ungrounded', async () => {
    const { provider } = withFakeApi([response([message('Hello!')])]);
    const result = await provider.answerQuestion({ question: 'hi', currency: 'CAD', today: '2026-10-08', tools: [] });
    expect(result.data).toMatchObject({ answer: 'Hello!', grounded: false, toolCalls: [] });
  });

  it('tells the model when its tool arguments are not valid JSON instead of running the tool', async () => {
    const broken = { ...call('spending_total', {}), arguments: '{not json' };
    const { provider, requests } = withFakeApi([response([broken]), response([message('Sorry.')])]);
    let ran = false;
    await provider.answerQuestion({
      question: 'q', currency: 'CAD', today: '2026-10-08',
      tools: [{ name: 'spending_total', description: '', inputSchema: { type: 'object' }, run: async () => { ran = true; return {}; } }],
    });
    expect(ran).toBe(false);
    const sent = (requests[1]!.input as { type?: string; output?: string }[]).find((i) => i.type === 'function_call_output');
    expect(sent?.output).toContain('not valid JSON');
  });

  it('extracts transactions from a forced tool call and sends images as data URLs', async () => {
    const { provider, requests } = withFakeApi([response([call('record_transactions', {
      transactions: [{ date: 'Sep 10', description: 'NO FRILLS', amount: '$72.18', direction: 'debit' }],
      dateFormatHint: 'mdy',
    })])]);

    const result = await provider.extractTransactions({ kind: 'image', content: 'AAAA', mediaType: 'image/jpeg' });

    expect(result.data.transactions).toHaveLength(1);
    expect(result.data.transactions[0]).toMatchObject({ amount: '$72.18', description: 'NO FRILLS' });
    expect(requests[0]!.tool_choice).toEqual({ type: 'function', name: 'record_transactions' });
    const content = (requests[0]!.input as { content: { type: string; image_url?: string }[] }[])[0]!.content;
    expect(content[0]).toMatchObject({ type: 'input_image', image_url: 'data:image/jpeg;base64,AAAA' });
  });

  it('rejects extraction output that does not match the schema', async () => {
    const { provider } = withFakeApi([response([call('record_transactions', { transactions: [{ date: 'Sep 10' }] })])]);
    await expect(provider.extractTransactions({ kind: 'text', content: 'x' })).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('keeps conversation turns separate and puts the brief in instructions', async () => {
    const { provider, requests } = withFakeApi([response([message('ready')])]);
    const result = await provider.converse({
      brief: 'You are Pock.',
      messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'Reply ready' }],
      maxTokens: 16,
    });
    expect(result.data).toBe('ready');
    expect(requests[0]).toMatchObject({ instructions: 'You are Pock.', model: 'gpt-test' });
    expect((requests[0]!.input as unknown[]).length).toBe(3);
    // A tiny cap would leave a reasoning model no room to answer.
    expect(requests[0]!.max_output_tokens).toBeGreaterThanOrEqual(256);
  });
});

describe('describeProviderError for OpenAI', () => {
  it('reads an empty OpenAI account as out of credit, not as a rate limit', () => {
    const p = describeProviderError(new Error('429 You exceeded your current quota, please check your plan and billing details. insufficient_quota'));
    expect(p.message).toContain('run out of credit');
    expect(p.detail).toContain('platform.openai.com');
  });

  it('names the OpenAI key and model variables', () => {
    expect(describeProviderError(new Error('401 Incorrect API key provided: sk-...')).detail).toContain('OPENAI_API_KEY');
    expect(describeProviderError(new Error('404 The model `gpt-x` does not exist or you do not have access to it. model_not_found')).detail).toContain('OPENAI_MODEL');
  });

  it('still names the Anthropic key for Anthropic errors', () => {
    expect(describeProviderError(new Error('401 invalid x-api-key')).detail).toContain('ANTHROPIC_API_KEY');
  });
});

import OpenAI from 'openai';
import { toResponseInputItems } from 'openai/lib/responses/ResponseInputItems';
import type {
  AiProvider, ExtractionInput, ExtractionResult, ProviderResponse,
  AssistantInput, AssistantResult, AssistantToolCall,
} from './types';
import { extractionResultSchema, AiUnavailableError } from './types';
import { EXTRACTION_SYSTEM, EXTRACTION_TOOL_SCHEMA, buildAssistantSystem, buildExtractionInstruction, NARRATE_SYSTEM } from './prompts';

export const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
const MAX_TOOL_ROUNDS = 6;

type Input = OpenAI.Responses.ResponseInputItem;

/**
 * The same contract as the Anthropic provider, on OpenAI's Responses API.
 *
 * The two rules carry over unchanged: extraction output is schema validated and
 * rejected if it does not conform, and an answer that consulted no tool is marked
 * ungrounded. Only the wire format differs.
 */
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  readonly capabilities = {
    vision: true, documents: true, tools: true,
    label: 'OpenAI',
  };

  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model ?? DEFAULT_OPENAI_MODEL;
  }

  private usage(response: OpenAI.Responses.Response, started: number) {
    return {
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      latencyMs: Date.now() - started,
      model: this.model,
      provider: 'openai',
    };
  }

  async extractTransactions(input: ExtractionInput): Promise<ProviderResponse<ExtractionResult>> {
    const started = Date.now();

    const content: OpenAI.Responses.ResponseInputContent[] = [];
    if (input.kind === 'image') {
      content.push({
        type: 'input_image',
        detail: 'high',
        image_url: `data:${input.mediaType ?? 'image/png'};base64,${input.content}`,
      });
    } else {
      content.push({ type: 'input_text', text: input.content.slice(0, 200_000) });
    }
    content.push({ type: 'input_text', text: buildExtractionInstruction(input) });

    let response: OpenAI.Responses.Response;
    try {
      response = await this.client.responses.create({
        model: this.model,
        max_output_tokens: 8000,
        instructions: EXTRACTION_SYSTEM,
        input: [{ role: 'user', content }],
        tools: [{
          type: 'function',
          name: 'record_transactions',
          description: 'Record every financial transaction visible in the source.',
          parameters: EXTRACTION_TOOL_SCHEMA,
          strict: false,
        }],
        tool_choice: { type: 'function', name: 'record_transactions' },
      });
    } catch (error) {
      throw new AiUnavailableError(
        `The AI provider could not process this file: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    const call = response.output.find((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === 'function_call');
    if (!call) {
      throw new AiUnavailableError('The AI provider returned no structured result for this file.');
    }

    // Reject rather than coerce, exactly as the Anthropic path does.
    const parsed = extractionResultSchema.safeParse(safeJson(call.arguments));
    if (!parsed.success) {
      throw new AiUnavailableError(
        `The extracted data did not match the expected shape: ${parsed.error.issues[0]?.message ?? 'validation failed'}`,
      );
    }

    return { data: parsed.data, usage: this.usage(response, started) };
  }

  async answerQuestion(input: AssistantInput): Promise<ProviderResponse<AssistantResult>> {
    const started = Date.now();
    const toolCalls: AssistantToolCall[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    const conversation: Input[] = [
      ...(input.history ?? []).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: input.question },
    ];

    const tools: OpenAI.Responses.FunctionTool[] = input.tools.map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
      strict: false,
    }));
    const byName = new Map(input.tools.map((t) => [t.name, t]));
    const totals = () => ({ inputTokens, outputTokens, latencyMs: Date.now() - started, model: this.model, provider: 'openai' });

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await this.client.responses.create({
        model: this.model,
        max_output_tokens: 2000,
        instructions: buildAssistantSystem(input),
        input: conversation,
        tools,
      });
      inputTokens += response.usage?.input_tokens ?? 0;
      outputTokens += response.usage?.output_tokens ?? 0;

      const calls = response.output.filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === 'function_call');
      if (calls.length === 0) {
        return {
          data: { answer: response.output_text.trim(), toolCalls, grounded: toolCalls.length > 0 },
          usage: totals(),
        };
      }

      // Every output item goes back in order: reasoning items dropped between a
      // call and its result make the next request fail.
      conversation.push(...toResponseInputItems(response.output));

      for (const call of calls) {
        const tool = byName.get(call.name);
        const args = safeJson(call.arguments);
        const toolInput = args && typeof args === 'object' ? args as Record<string, unknown> : {};
        let result: unknown;
        if (!tool) {
          result = { error: `Unknown tool ${call.name}` };
        } else if (args === undefined) {
          result = { error: 'The tool arguments were not valid JSON.' };
        } else {
          try {
            result = await tool.run(toolInput);
          } catch (error) {
            result = { error: error instanceof Error ? error.message : 'Tool failed' };
          }
        }
        toolCalls.push({ name: call.name, input: toolInput, result });
        conversation.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(result).slice(0, 40_000),
        });
      }
    }

    return {
      data: {
        answer: 'I could not finish answering that within a reasonable number of steps. Try asking something more specific.',
        toolCalls,
        grounded: toolCalls.length > 0,
      },
      usage: totals(),
    };
  }

  private async text(instructions: string, input: string | Input[], maxTokens: number): Promise<ProviderResponse<string>> {
    const started = Date.now();
    const response = await this.client.responses.create({
      model: this.model,
      max_output_tokens: maxTokens,
      instructions,
      input,
    });
    return { data: response.output_text.trim(), usage: this.usage(response, started) };
  }

  research(input: { brief: string; factSheet: string; maxTokens?: number }): Promise<ProviderResponse<string>> {
    return this.text(input.brief, input.factSheet, input.maxTokens ?? 1600);
  }

  converse(input: {
    brief: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    maxTokens?: number;
  }): Promise<ProviderResponse<string>> {
    // Reasoning models spend part of the budget thinking, so a tiny cap (the health
    // check asks for 16) can come back empty. Give it a floor.
    return this.text(input.brief, input.messages.map((m) => ({ role: m.role, content: m.content })), Math.max(input.maxTokens ?? 1200, 256));
  }

  narrate(input: { instruction: string; facts: Record<string, unknown> }): Promise<ProviderResponse<string>> {
    return this.text(
      NARRATE_SYSTEM,
      `${input.instruction}\n\nFacts (the only numbers you may use):\n${JSON.stringify(input.facts, null, 2)}`,
      400,
    );
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

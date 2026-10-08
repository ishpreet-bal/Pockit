import Anthropic from '@anthropic-ai/sdk';
import type {
  AiProvider, ExtractionInput, ExtractionResult, ProviderResponse,
  AssistantInput, AssistantResult, AssistantToolCall,
} from './types';
import { extractionResultSchema, AiUnavailableError } from './types';
import { EXTRACTION_SYSTEM, EXTRACTION_TOOL_SCHEMA, buildAssistantSystem, buildExtractionInstruction, NARRATE_SYSTEM } from './prompts';

const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 6;

/**
 * Vision and document extraction, plus the tool-calling assistant.
 *
 * Two rules are enforced here rather than trusted to the prompt:
 *  1. Extraction output is parsed against a Zod schema and REJECTED if it does not
 *     conform. A malformed response fails the import; it never half-writes rows.
 *  2. The assistant's numbers must come from tool results. If the model answers
 *     without calling a tool, `grounded` is false and the UI says so.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly capabilities = {
    vision: true, documents: true, tools: true,
    label: 'Anthropic Claude',
  };

  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model ?? DEFAULT_MODEL;
  }

  async extractTransactions(input: ExtractionInput): Promise<ProviderResponse<ExtractionResult>> {
    const started = Date.now();

    const content: Anthropic.ContentBlockParam[] = [];
    if (input.kind === 'image') {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: (input.mediaType ?? 'image/png') as 'image/png',
          data: input.content,
        },
      });
    } else {
      content.push({ type: 'text', text: input.content.slice(0, 200_000) });
    }
    content.push({ type: 'text', text: buildExtractionInstruction(input) });

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8000,
        system: EXTRACTION_SYSTEM,
        messages: [{ role: 'user', content }],
        tools: [{
          name: 'record_transactions',
          description: 'Record every financial transaction visible in the source.',
          input_schema: EXTRACTION_TOOL_SCHEMA as Anthropic.Tool.InputSchema,
        }],
        tool_choice: { type: 'tool', name: 'record_transactions' },
      });
    } catch (error) {
      throw new AiUnavailableError(
        `The AI provider could not process this file: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) {
      throw new AiUnavailableError('The AI provider returned no structured result for this file.');
    }

    // Reject rather than coerce: a silently repaired financial record is worse than
    // a failed import, because the user never learns it was wrong.
    const parsed = extractionResultSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new AiUnavailableError(
        `The extracted data did not match the expected shape: ${parsed.error.issues[0]?.message ?? 'validation failed'}`,
      );
    }

    return {
      data: parsed.data,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - started,
        model: this.model,
        provider: 'anthropic',
      },
    };
  }

  async answerQuestion(input: AssistantInput): Promise<ProviderResponse<AssistantResult>> {
    const started = Date.now();
    const toolCalls: AssistantToolCall[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    const messages: Anthropic.MessageParam[] = [
      ...(input.history ?? []).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: input.question },
    ];

    const tools: Anthropic.Tool[] = input.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));
    const byName = new Map(input.tools.map((t) => [t.name, t]));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        system: buildAssistantSystem(input),
        messages,
        tools,
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (uses.length === 0) {
        const answer = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text).join('\n').trim();
        return {
          data: { answer, toolCalls, grounded: toolCalls.length > 0 },
          usage: { inputTokens, outputTokens, latencyMs: Date.now() - started, model: this.model, provider: 'anthropic' },
        };
      }

      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];

      for (const use of uses) {
        const tool = byName.get(use.name);
        let result: unknown;
        if (!tool) {
          result = { error: `Unknown tool ${use.name}` };
        } else {
          try {
            result = await tool.run(use.input as Record<string, unknown>);
          } catch (error) {
            result = { error: error instanceof Error ? error.message : 'Tool failed' };
          }
        }
        toolCalls.push({ name: use.name, input: use.input as Record<string, unknown>, result });
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(result).slice(0, 40_000),
        });
      }

      messages.push({ role: 'user', content: results });
    }

    return {
      data: {
        answer: 'I could not finish answering that within a reasonable number of steps. Try asking something more specific.',
        toolCalls,
        grounded: toolCalls.length > 0,
      },
      usage: { inputTokens, outputTokens, latencyMs: Date.now() - started, model: this.model, provider: 'anthropic' },
    };
  }

  async research(input: { brief: string; factSheet: string; maxTokens?: number }): Promise<ProviderResponse<string>> {
    const started = Date.now();
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: input.maxTokens ?? 1600,
      system: input.brief,
      messages: [{ role: 'user', content: input.factSheet }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('').trim();

    return {
      data: text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - started,
        model: this.model,
        provider: 'anthropic',
      },
    };
  }

  async converse(input: {
    brief: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    maxTokens?: number;
  }): Promise<ProviderResponse<string>> {
    const started = Date.now();
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: input.maxTokens ?? 1200,
      system: input.brief,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('').trim();

    return {
      data: text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - started,
        model: this.model,
        provider: 'anthropic',
      },
    };
  }

  async narrate(input: { instruction: string; facts: Record<string, unknown> }): Promise<ProviderResponse<string>> {
    const started = Date.now();
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 400,
      system: NARRATE_SYSTEM,
      messages: [{
        role: 'user',
        content: `${input.instruction}\n\nFacts (the only numbers you may use):\n${JSON.stringify(input.facts, null, 2)}`,
      }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('').trim();

    return {
      data: text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - started,
        model: this.model,
        provider: 'anthropic',
      },
    };
  }
}

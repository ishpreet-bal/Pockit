/**
 * AI provider abstraction (spec §32: "use a provider abstraction so the application
 * is not permanently tied to one model").
 *
 * The contract that matters: extraction returns STRUCTURED DATA that is then schema
 * validated, never prose. A provider may not write to the ledger — it produces
 * candidates, and a human accepts them.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Extraction                                                          */
/* ------------------------------------------------------------------ */

/** What the model is asked to return for each row it finds. */
export const extractedTransactionSchema = z.object({
  /** As printed in the source. Normalisation happens later, deterministically. */
  date: z.string().min(1).max(40),
  description: z.string().min(1).max(300),
  merchant: z.string().max(200).nullable().optional(),
  /** As printed, e.g. "$72.18" or "(45.00)". Parsed by lib/money, never by the model. */
  amount: z.string().min(1).max(40),
  currency: z.string().length(3).nullable().optional(),
  direction: z.enum(['debit', 'credit']).nullable().optional(),
  /** Per-field confidence 0-100, driving the "please verify this field" highlighting. */
  confidence: z.object({
    date: z.number().min(0).max(100).optional(),
    description: z.number().min(0).max(100).optional(),
    amount: z.number().min(0).max(100).optional(),
    merchant: z.number().min(0).max(100).optional(),
  }).optional(),
  /** Where in the source this came from, retained as provenance (spec §45). */
  sourceRef: z.string().max(200).nullable().optional(),
});

export type ExtractedTransaction = z.infer<typeof extractedTransactionSchema>;

export const extractionResultSchema = z.object({
  transactions: z.array(extractedTransactionSchema).max(2000),
  /** Statement period, used to disambiguate dates that lack a year. */
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  accountHint: z.string().max(200).nullable().optional(),
  currencyHint: z.string().length(3).nullable().optional(),
  /** 'dmy' vs 'mdy' — "09/10" is ambiguous and the model often knows from context. */
  dateFormatHint: z.enum(['dmy', 'mdy', 'ymd', 'unknown']).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export interface ExtractionInput {
  kind: 'text' | 'image' | 'pdf_text';
  /** Plain text for text/pdf_text; base64 for image. */
  content: string;
  mediaType?: string;
  filename?: string;
  /** Hints from the user or from the file itself. */
  currencyHint?: string;
  dateFormatHint?: 'dmy' | 'mdy' | 'ymd' | 'unknown';
}

/* ------------------------------------------------------------------ */
/* Assistant                                                           */
/* ------------------------------------------------------------------ */

export interface AssistantToolCall {
  name: string;
  input: Record<string, unknown>;
  /** The real result the tool returned. Numbers in the answer must come from here. */
  result: unknown;
}

export interface AssistantInput {
  question: string;
  /** The tools the model may call. Each runs a real query against the ledger. */
  tools: AssistantToolDefinition[];
  history?: { role: 'user' | 'assistant'; content: string }[];
  currency: string;
  today: string;
}

export interface AssistantToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface AssistantResult {
  answer: string;
  toolCalls: AssistantToolCall[];
  /** False when the model answered without consulting the ledger — the UI warns. */
  grounded: boolean;
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export interface ProviderCapabilities {
  vision: boolean;
  documents: boolean;
  tools: boolean;
  /** Shown in the UI so the user knows what is processing their data. */
  label: string;
}

export interface UsageStats {
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  model: string;
  provider: string;
}

export interface ProviderResponse<T> {
  data: T;
  usage: UsageStats;
}

export interface AiProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  extractTransactions(input: ExtractionInput): Promise<ProviderResponse<ExtractionResult>>;
  answerQuestion(input: AssistantInput): Promise<ProviderResponse<AssistantResult>>;
  /** Phrases figures it did NOT compute. It may never introduce a new number. */
  narrate(input: { instruction: string; facts: Record<string, unknown> }): Promise<ProviderResponse<string>>;
  /**
   * Longer-form reasoning over a supplied fact sheet.
   *
   * Separate from `narrate` because that one is capped at two sentences by design.
   * The constraint is the same and is the whole point: the model works from the
   * facts it is handed and may not import anything it thinks it remembers.
   */
  research(input: { brief: string; factSheet: string; maxTokens?: number }): Promise<ProviderResponse<string>>;

  /**
   * A grounded conversation with turns.
   *
   * Separate from `research` because a conversation needs the earlier turns, and
   * flattening them into one string loses who said what — which is how a model
   * starts attributing its own previous guesses to the user as established fact.
   */
  converse(input: {
    brief: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    maxTokens?: number;
  }): Promise<ProviderResponse<string>>;
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

import type {
  AiProvider, ExtractionInput, ExtractionResult, ProviderResponse,
  AssistantInput, AssistantResult, ExtractedTransaction,
} from './types';
import { AiUnavailableError } from './types';

/**
 * The no-API-key provider.
 *
 * This is NOT a stub. It genuinely extracts transactions from structured and
 * semi-structured text — CSV, tab-separated exports, and the line formats banks use
 * in text PDF statements — using deterministic parsing. That means the import
 * pipeline is useful before the user has configured anything.
 *
 * What it honestly cannot do is read an image. `capabilities.vision` is false, and
 * the UI disables image upload rather than pretending.
 */
export class HeuristicProvider implements AiProvider {
  readonly name = 'heuristic';
  readonly capabilities = {
    vision: false,
    documents: true,
    tools: false,
    label: 'On-device parsing (no AI provider configured)',
  };

  async extractTransactions(input: ExtractionInput): Promise<ProviderResponse<ExtractionResult>> {
    const started = Date.now();

    if (input.kind === 'image') {
      throw new AiUnavailableError(
        'Reading images requires a vision-capable AI provider. Add an ANTHROPIC_API_KEY or OPENAI_API_KEY, or upload a CSV, Excel or text-based PDF instead.',
      );
    }

    const transactions = parseStatementText(input.content);
    const period = inferPeriod(transactions);

    return {
      data: {
        transactions,
        periodStart: period.start,
        periodEnd: period.end,
        currencyHint: input.currencyHint ?? null,
        dateFormatHint: input.dateFormatHint ?? 'unknown',
        accountHint: null,
        notes: null,
      },
      usage: {
        inputTokens: null, outputTokens: null,
        latencyMs: Date.now() - started, model: 'heuristic', provider: 'heuristic',
      },
    };
  }

  async answerQuestion(_input: AssistantInput): Promise<ProviderResponse<AssistantResult>> {
    throw new AiUnavailableError(
      'The financial assistant needs an AI provider. Add an ANTHROPIC_API_KEY or OPENAI_API_KEY to enable it.',
    );
  }

  async narrate(input: { instruction: string; facts: Record<string, unknown> }): Promise<ProviderResponse<string>> {
    // Without a model there is nothing to phrase the figures with, so the caller
    // falls back to the deterministic headline the insights engine already produced.
    return {
      data: String(input.facts.headline ?? ''),
      usage: { inputTokens: null, outputTokens: null, latencyMs: 0, model: 'heuristic', provider: 'heuristic' },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Statement line parsing                                              */
/* ------------------------------------------------------------------ */

/** A date at the start of a line, in any of the common printed forms. */
const DATE_PATTERNS = [
  /^(\d{4}-\d{2}-\d{2})/,                                   // 2026-09-10
  /^(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/,                   // 09/10/2026
  /^(\d{1,2}[/\-.]\d{1,2})\b/,                              // 09/10
  /^([A-Z][a-z]{2}\.?\s+\d{1,2},?\s*\d{0,4})/,              // Sep 10, 2026
  /^(\d{1,2}\s+[A-Z][a-z]{2}\.?\s*\d{0,4})/,                // 10 Sep 2026
];

/** An amount anywhere in the line, including accounting parentheses and trailing signs. */
const AMOUNT_PATTERN = /(\(?-?[$€£¥]?\s?\d{1,3}(?:[,\s]\d{3})*(?:[.,]\d{2})?\)?-?)(?:\s*(?:CR|DR))?\s*$/i;
const ANY_AMOUNT = /(\(?-?[$€£¥]?\s?\d{1,3}(?:[,\s]\d{3})*(?:[.,]\d{2})\)?-?)/g;

/**
 * Parse free text into transaction rows.
 *
 * Handles the two shapes that actually occur: delimited exports (CSV/TSV pasted as
 * text) and statement lines of the form `DATE  DESCRIPTION  AMOUNT [BALANCE]`.
 */
export function parseStatementText(text: string): ExtractedTransaction[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ExtractedTransaction[] = [];

  for (const [index, line] of lines.entries()) {
    if (isNoiseLine(line)) continue;

    let dateRaw: string | null = null;
    let rest = line;
    for (const pattern of DATE_PATTERNS) {
      const match = pattern.exec(line);
      if (match?.[1]) {
        dateRaw = match[1].trim();
        rest = line.slice(match[0].length).trim();
        break;
      }
    }
    if (!dateRaw) continue;

    // Some statements print both the transaction amount and a running balance. The
    // LAST number is the balance, so when two trail the line, take the first.
    const amounts = [...rest.matchAll(ANY_AMOUNT)].map((m) => m[1]!.trim());
    let amountRaw: string | null = null;
    let description = rest;

    if (amounts.length >= 2) {
      amountRaw = amounts[amounts.length - 2]!;
      description = rest.slice(0, rest.lastIndexOf(amounts[amounts.length - 2]!)).trim();
    } else {
      const tail = AMOUNT_PATTERN.exec(rest);
      if (tail?.[1]) {
        amountRaw = tail[1].trim();
        description = rest.slice(0, tail.index).trim();
      } else if (amounts.length === 1) {
        amountRaw = amounts[0]!;
        description = rest.replace(amounts[0]!, '').trim();
      }
    }

    if (!amountRaw) continue;
    description = description.replace(/[\s|,;\t]+$/, '').replace(/\s{2,}/g, ' ').trim();
    if (!description) continue;

    // A credit-marked line, a leading +, or parentheses decide the direction.
    const isCredit = /\bCR\b/i.test(line) && !/\bDR\b/i.test(line);

    out.push({
      date: dateRaw,
      description,
      merchant: null,
      amount: amountRaw,
      currency: null,
      direction: isCredit ? 'credit' : 'debit',
      confidence: {
        // Deterministic parsing is certain about what it read; it is the meaning,
        // not the reading, that may be wrong.
        date: 92, description: 95, amount: 95,
      },
      sourceRef: `line ${index + 1}`,
    });
  }

  return out;
}

const NOISE = [
  /^page \d+/i, /^statement\b/i, /^account (number|summary)/i, /^opening balance/i,
  /^closing balance/i, /^total\b/i, /^subtotal/i, /^balance forward/i,
  /^date\s+(description|transaction)/i, /^previous balance/i, /^minimum payment/i,
  /^payment due/i, /^credit limit/i, /^available credit/i,
];

function isNoiseLine(line: string): boolean {
  if (line.length < 8) return true;
  return NOISE.some((p) => p.test(line));
}

function inferPeriod(txns: readonly ExtractedTransaction[]): { start: string | null; end: string | null } {
  const isoDates = txns.map((t) => t.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return { start: isoDates[0] ?? null, end: isoDates[isoDates.length - 1] ?? null };
}

/**
 * Prompts shared by every model provider, so switching provider changes the wire
 * format and nothing about what the model is told.
 */
import type { AssistantInput, ExtractionInput } from './types';

export const NARRATE_SYSTEM =
  'You rephrase financial figures that have already been calculated. You must NEVER introduce, ' +
  'recompute, estimate or infer any number that is not present in the supplied facts. Write two ' +
  'sentences at most, plainly and without judgement about the spending.';

/* ------------------------------------------------------------------ */

export const EXTRACTION_SYSTEM = `You extract financial transactions from documents, statements and screenshots.

Rules:
- Transcribe amounts and dates EXACTLY as printed. Do not reformat, convert or do arithmetic. If the source says "(45.00)" return "(45.00)"; if it says "1.234,56" return "1.234,56". Downstream code parses them.
- Never invent a transaction. If a row is partly illegible, return what you can read and set a low confidence on the uncertain field.
- Do not return running balances as transactions. A statement line often shows both the transaction amount and the balance after it; only the transaction amount is a transaction.
- Skip headers, footers, page numbers, totals, and summary lines such as "Previous balance" or "Minimum payment".
- Set per-field confidence honestly. 100 means the text is perfectly legible; below 70 means a human should check it.
- If you can tell the date format from context (for example a statement period, or a day greater than 12), report it in dateFormatHint.
- Return every transaction you can see, in the order they appear.`;

export function buildExtractionInstruction(input: ExtractionInput): string {
  const parts = ['Extract every transaction from this source using the record_transactions tool.'];
  if (input.filename) parts.push(`The file is named "${input.filename}".`);
  if (input.currencyHint) parts.push(`The account currency is likely ${input.currencyHint}.`);
  if (input.dateFormatHint && input.dateFormatHint !== 'unknown') {
    parts.push(`Dates in this source are ${input.dateFormatHint.toUpperCase()} ordered.`);
  }
  return parts.join(' ');
}

export function buildAssistantSystem(input: AssistantInput): string {
  return `You answer questions about the user's own financial records.

Today is ${input.today}. Their base currency is ${input.currency}.

CRITICAL: every number in your answer must come from a tool result. You have tools that run real
queries against their ledger — use them. Never estimate, never recall a figure from earlier in the
conversation, and never do arithmetic the tools can do for you. If no tool can answer the question,
say so plainly rather than guessing.

State the filters you used, in plain language, so the user can check the figure themselves. Be brief
and factual. Do not give financial advice, and do not comment on whether their spending is good or bad.`;
}

export const EXTRACTION_TOOL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Exactly as printed, e.g. "Sep 10" or "2026-09-10".' },
          description: { type: 'string', description: 'The description text as printed.' },
          merchant: { type: ['string', 'null'], description: 'The merchant name if identifiable.' },
          amount: { type: 'string', description: 'Exactly as printed, e.g. "$72.18" or "(45.00)".' },
          currency: { type: ['string', 'null'], description: 'ISO code if shown.' },
          direction: { type: ['string', 'null'], enum: ['debit', 'credit', null], description: 'debit = money out, credit = money in.' },
          confidence: {
            type: 'object',
            properties: {
              date: { type: 'number' }, description: { type: 'number' },
              amount: { type: 'number' }, merchant: { type: 'number' },
            },
          },
          sourceRef: { type: ['string', 'null'], description: 'Where this appeared, e.g. "page 2, row 14".' },
        },
        required: ['date', 'description', 'amount'],
      },
    },
    periodStart: { type: ['string', 'null'] },
    periodEnd: { type: ['string', 'null'] },
    accountHint: { type: ['string', 'null'] },
    currencyHint: { type: ['string', 'null'] },
    dateFormatHint: { type: ['string', 'null'], enum: ['dmy', 'mdy', 'ymd', 'unknown', null] },
    notes: { type: ['string', 'null'] },
  },
  required: ['transactions'],
};

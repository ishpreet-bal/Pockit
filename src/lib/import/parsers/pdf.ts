import 'server-only';
import type { ParsedSource } from './index';
import { parseStatementText } from '@/lib/ai/heuristic';

/**
 * PDF text extraction.
 *
 * Statements come in two kinds. Text PDFs (produced by a bank's own system) contain
 * real text and are parsed deterministically here — no AI, no cost, no uncertainty.
 * Scanned PDFs contain only page images and need a vision provider; this returns
 * `needsVision` so the pipeline can say so plainly instead of returning nothing.
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedSource & { needsVision: boolean }> {
  const warnings: string[] = [];
  let text = '';
  let pageCount = 0;

  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    pageCount = doc.numPages;
    // mergePages narrows the return type to a string, but be defensive about it.
    const result = await extractText(doc, { mergePages: true });
    const raw: unknown = result.text;
    text = Array.isArray(raw) ? raw.join('\n') : String(raw ?? '');
  } catch (error) {
    return {
      kind: 'pdf', transactions: [], text: null, images: [], needsVision: true,
      warnings: [`This PDF could not be read as text: ${error instanceof Error ? error.message : 'unknown error'}`],
    };
  }

  const meaningful = text.replace(/\s/g, '').length;
  // A text layer of only a few characters per page means the pages are images.
  if (meaningful < Math.max(80, pageCount * 40)) {
    return {
      kind: 'pdf', transactions: [], text: null, images: [], needsVision: true,
      warnings: ['This PDF appears to be scanned rather than text-based, so reading it needs a vision-capable AI provider.'],
    };
  }

  const transactions = parseStatementText(text);
  if (transactions.length === 0) {
    warnings.push('No transaction lines were recognised in the text layer of this PDF.');
  }

  return {
    kind: 'pdf',
    transactions,
    // Text is retained so an AI provider can have a second attempt when the
    // deterministic line parser finds nothing.
    text: transactions.length === 0 ? text.slice(0, 150_000) : null,
    images: [],
    needsVision: false,
    warnings,
  };
}

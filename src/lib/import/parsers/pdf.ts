import 'server-only';
import type { ParsedSource } from './index';
import { parseStatementText } from '@/lib/ai/heuristic';

export class PdfImportError extends Error {
  constructor(message: string) { super(message); this.name = 'PdfImportError'; }
}

/**
 * PDF text extraction.
 *
 * Statements come in two kinds. Text PDFs (produced by a bank's own system) contain
 * real text and are parsed deterministically here — no AI, no cost, no uncertainty.
 * Scanned PDFs have no text layer. Until page rasterization exists, reject them
 * with a useful alternative instead of handing the pipeline an empty image array.
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
  } catch {
    throw new PdfImportError('This PDF could not be opened. If it is password-protected, export an unlocked copy, or upload a CSV statement instead.');
  }

  const meaningful = text.replace(/\s/g, '').length;
  // A text layer of only a few characters per page means the pages are images.
  if (meaningful < Math.max(80, pageCount * 40)) {
    throw new PdfImportError('This PDF has no readable text. Upload clear JPG or PNG images of its pages, or a text-based PDF or CSV statement instead.');
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

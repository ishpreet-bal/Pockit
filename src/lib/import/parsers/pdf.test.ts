import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePdf, PdfImportError } from './pdf';

const pdf = vi.hoisted(() => ({ open: vi.fn(), text: vi.fn() }));
vi.mock('unpdf', () => ({ getDocumentProxy: pdf.open, extractText: pdf.text }));

describe('PDF import failures', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    pdf.open.mockResolvedValue({ numPages: 2 });
  });

  it('gives scanned statements a usable alternative instead of an empty vision input', async () => {
    pdf.text.mockResolvedValue({ text: '' });
    const result = parsePdf(Buffer.from('scanned statement'));
    await expect(result).rejects.toBeInstanceOf(PdfImportError);
    await expect(result).rejects.toThrow(/JPG or PNG images/);
  });

  it('explains unreadable or locked PDFs without exposing the parser exception', async () => {
    pdf.open.mockRejectedValue(new Error('internal parser detail'));
    const result = parsePdf(Buffer.from('locked document'));
    await expect(result).rejects.toThrow(/unlocked copy/);
    await expect(result).rejects.not.toThrow(/internal parser detail/);
  });

  it('continues to parse text-based statements without an AI provider', async () => {
    pdf.text.mockResolvedValue({ text: `${'Bank statement account information '.repeat(6)}\n2026-09-10 SHELL -72.18\n2026-09-11 COFFEE -4.85` });
    const result = await parsePdf(Buffer.from('text statement'));
    expect(result.needsVision).toBe(false);
    expect(result.transactions.length).toBeGreaterThan(0);
  });
});

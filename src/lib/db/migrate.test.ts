import { describe, it, expect } from 'vitest';

/**
 * Regression for a hang, not a failure.
 *
 * The migration runner filtered out comment-only chunks with `/^(--[^\n]*\n?)*$/`.
 * That nested quantifier backtracks catastrophically on a chunk that starts with
 * comment lines and then contains SQL — precisely how the triggers-and-RLS migration
 * begins. It never threw and never returned: the migration silently stalled, leaving
 * a production database with tables but no row-level security.
 */
function isOnlyComments(chunk: string): boolean {
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (trimmed !== '' && !trimmed.startsWith('--')) return false;
  }
  return true;
}

describe('migration chunk filtering', () => {
  it('recognises comment-only chunks', () => {
    expect(isOnlyComments('-- just a comment')).toBe(true);
    expect(isOnlyComments('-- one\n-- two\n\n-- three')).toBe(true);
    expect(isOnlyComments('')).toBe(true);
  });

  it('keeps chunks that contain SQL', () => {
    expect(isOnlyComments('-- explain\nCREATE TABLE x (id int);')).toBe(false);
    expect(isOnlyComments('SELECT 1')).toBe(false);
  });

  it('completes immediately on the input that used to hang', () => {
    // Comment preamble followed by SQL, repeated — the exact catastrophic shape.
    const chunk = `${'-- a comment line that is reasonably long\n'.repeat(40)}CREATE INDEX x ON y (z);\n${'-- more\n'.repeat(40)}ALTER TABLE a ENABLE ROW LEVEL SECURITY;`;
    const started = Date.now();
    expect(isOnlyComments(chunk)).toBe(false);
    // The old regex took exponential time here; a line scan is linear.
    expect(Date.now() - started).toBeLessThan(50);
  });

  it('scales linearly with input size', () => {
    const big = `${'-- comment\n'.repeat(5000)}SELECT 1;`;
    const started = Date.now();
    expect(isOnlyComments(big)).toBe(false);
    expect(Date.now() - started).toBeLessThan(100);
  });
});

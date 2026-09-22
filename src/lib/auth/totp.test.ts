import { describe, it, expect } from 'vitest';

// The module reads AUTH_SECRET at call time through `env`, so a value has to exist
// before it is imported.
process.env.AUTH_SECRET ??= 'x'.repeat(48);
process.env.DATABASE_URL ??= 'postgres://localhost:5432/test';

const {
  codeForStep, verifyCode, generateSecret, generateRecoveryCodes, normaliseRecoveryCode,
  encryptSecret, decryptSecret, otpauthUri, currentStep,
} = await import('./totp');

describe('TOTP', () => {
  /**
   * RFC 6238 Appendix B, the SHA-1 rows.
   *
   * These are the published vectors. Testing our implementation against our own
   * output would prove only that it is consistent, which is exactly how a subtly
   * wrong HOTP truncation ships — the codes look plausible and no app accepts them.
   * The seed is the ASCII "12345678901234567890" in base32.
   */
  const SEED = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const vectors: [number, string][] = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ];

  it.each(vectors)('matches RFC 6238 at t=%i', (seconds, expected) => {
    expect(codeForStep(SEED, Math.floor(seconds / 30))).toBe(expected);
  });

  it('accepts the current code', () => {
    const at = new Date(1111111109 * 1000);
    expect(verifyCode(SEED, '081804', null, at).ok).toBe(true);
  });

  it('tolerates one step of clock drift, either way', () => {
    const at = new Date(1111111109 * 1000);
    const step = currentStep(at);
    expect(verifyCode(SEED, codeForStep(SEED, step - 1), null, at).ok).toBe(true);
    expect(verifyCode(SEED, codeForStep(SEED, step + 1), null, at).ok).toBe(true);
  });

  it('refuses a step two away, so the guessing window stays narrow', () => {
    const at = new Date(1111111109 * 1000);
    const step = currentStep(at);
    expect(verifyCode(SEED, codeForStep(SEED, step + 2), null, at).ok).toBe(false);
  });

  it('refuses a code that was already used, inside its own window', () => {
    // A code read over someone's shoulder must not still work ten seconds later.
    const at = new Date(1111111109 * 1000);
    const first = verifyCode(SEED, '081804', null, at);
    expect(first.ok).toBe(true);
    expect(verifyCode(SEED, '081804', first.step, at).ok).toBe(false);
  });

  it('says WHY a spent code was refused, so the message can differ', () => {
    // "That code is not right" sends someone to check a phone clock that is fine.
    // The reused case has its own answer: wait for the next one.
    const at = new Date(1111111109 * 1000);
    const first = verifyCode(SEED, '081804', null, at);
    const again = verifyCode(SEED, '081804', first.step, at);
    expect(again.alreadyUsed).toBe(true);

    // A genuinely wrong code is not reported as reuse.
    expect(verifyCode(SEED, '000000', first.step, at).alreadyUsed).toBe(false);
  });

  it('refuses anything that is not six digits', () => {
    expect(verifyCode(SEED, '', null).ok).toBe(false);
    expect(verifyCode(SEED, '12345', null).ok).toBe(false);
    expect(verifyCode(SEED, 'abcdef', null).ok).toBe(false);
  });

  it('generates a base32 secret an app can read', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(() => codeForStep(secret, 1)).not.toThrow();
  });

  it('puts the secret in the otpauth URI without mangling the label', () => {
    const uri = otpauthUri('ABC234', 'ish@example.com');
    expect(uri).toContain('secret=ABC234');
    expect(uri).toContain('digits=6');
    expect(uri.startsWith('otpauth://totp/Pockit%3Aish%40example.com?')).toBe(true);
  });
});

describe('secret encryption', () => {
  it('round-trips', () => {
    const secret = generateSecret();
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('produces a different ciphertext each time', () => {
    // A fixed nonce would make GCM reuse catastrophic, and equal ciphertexts are
    // the visible symptom of it.
    const secret = generateSecret();
    expect(encryptSecret(secret)).not.toBe(encryptSecret(secret));
  });

  it('refuses a tampered value instead of returning a different secret', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXP');
    const parts = stored.split('.');
    const flipped = Buffer.from(parts[2]!, 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    parts[2] = flipped.toString('base64url');
    expect(decryptSecret(parts.join('.'))).toBeNull();
  });

  it('returns null for nonsense rather than throwing into a request', () => {
    expect(decryptSecret('not-a-ciphertext')).toBeNull();
    expect(decryptSecret('')).toBeNull();
  });
});

describe('recovery codes', () => {
  it('makes ten distinct, readable codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
  });

  it('omits characters people misread', () => {
    const joined = generateRecoveryCodes(50).join('');
    expect(joined).not.toMatch(/[01oil]/);
  });

  it('normalises how people actually type them back', () => {
    expect(normaliseRecoveryCode('  ABcd-EFgh ')).toBe('abcdefgh');
    expect(normaliseRecoveryCode('abcd efgh')).toBe('abcdefgh');
  });
});

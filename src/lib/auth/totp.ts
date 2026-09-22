import 'server-only';
import { createHmac, createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Time-based one-time passwords (RFC 6238), and the encryption around the secret.
 *
 * Three decisions here are security-relevant rather than stylistic:
 *
 *  - The shared secret is ENCRYPTED at rest, not hashed and not stored plainly. It
 *    cannot be hashed, because verifying a code requires the original value. A
 *    plaintext secret in a leaked database is immediately usable as somebody's
 *    second factor, which would make the whole feature decorative.
 *  - Verification accepts one step either side of now, and no more. Clocks drift;
 *    a wider window is a wider guessing target.
 *  - A step that has already been accepted is refused. Without that, a code
 *    observed over someone's shoulder stays valid for the rest of its 30 seconds.
 */

const DIGITS = 6;
const PERIOD = 30;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A new secret, 160 bits, base32 as every authenticator app expects. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The URI an authenticator app scans. Contains the secret, so it is never logged. */
export function otpauthUri(secret: string, account: string, issuer = 'Pockit'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** The current 30-second step, exposed so callers can store what they accepted. */
export function currentStep(at: Date = new Date()): number {
  return Math.floor(at.getTime() / 1000 / PERIOD);
}

export function codeForStep(secret: string, step: number): string {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigInt64BE(BigInt(step));

  const digest = createHmac('sha1', key).update(counter).digest();
  // Dynamic truncation, RFC 4226 §5.4.
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export interface VerifyResult {
  ok: boolean;
  /** The step that matched, to be stored so it cannot be reused. */
  step: number | null;
  /**
   * The code was arithmetically CORRECT but its step has already been spent.
   *
   * Worth distinguishing from a wrong code, because it happens to real people in
   * one specific situation — enrolling and immediately signing in elsewhere within
   * the same 30 seconds — and "that code is not right" sends them to check the
   * clock on a phone that is perfectly correct.
   */
  alreadyUsed: boolean;
}

/**
 * Check a code.
 *
 * `lastUsedStep` is the caller's record of the last step it accepted. Passing it is
 * what makes a code single-use; omitting it silently downgrades the guarantee, so
 * the parameter is required rather than optional.
 */
export function verifyCode(
  secret: string,
  input: string,
  lastUsedStep: number | null,
  at: Date = new Date(),
): VerifyResult {
  const cleaned = input.replace(/\D/g, '');
  if (cleaned.length !== DIGITS) return { ok: false, step: null, alreadyUsed: false };

  const now = currentStep(at);
  let alreadyUsed = false;
  for (const step of [now, now - 1, now + 1]) {
    if (!constantTimeEqual(codeForStep(secret, step), cleaned)) continue;
    // The code matches. Whether it is ACCEPTED depends on whether its step is spent.
    if (lastUsedStep !== null && step <= lastUsedStep) { alreadyUsed = true; continue; }
    return { ok: true, step, alreadyUsed: false };
  }
  return { ok: false, step: null, alreadyUsed };
}

/* ---------------- recovery codes ---------------- */

/**
 * Ten codes, shown once.
 *
 * Grouped as `abcd-efgh` because people write these on paper and read them back;
 * an unbroken ten-character string is read back wrong. The alphabet omits 0/O and
 * 1/l for the same reason.
 */
export function generateRecoveryCodes(count = 10): string[] {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    codes.push(`${chars.slice(0, 4)}-${chars.slice(4, 8)}`);
  }
  return codes;
}

export function normaliseRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* ---------------- encryption ---------------- */

/**
 * AES-256-GCM, keyed from AUTH_SECRET.
 *
 * GCM rather than CBC so the ciphertext is authenticated: a tampered secret fails
 * to decrypt instead of silently becoming a different secret. The nonce is random
 * per encryption and stored alongside, which is required — a reused nonce with the
 * same key breaks GCM completely.
 */
function key(): Buffer {
  return scryptSync(env.AUTH_SECRET, 'pockit-totp-v1', 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${enc.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

export function decryptSecret(stored: string): string | null {
  try {
    const [version, iv, payload, tag] = stored.split('.');
    if (version !== 'v1' || !iv || !payload || !tag) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(payload, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    // A wrong key or a tampered value lands here. Null, never a partial secret.
    return null;
  }
}

/* ---------------- base32, RFC 4648 ---------------- */

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = B32.indexOf(char);
    if (index === -1) throw new Error('Not a base32 secret.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

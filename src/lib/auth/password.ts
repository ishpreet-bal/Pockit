import { randomBytes, scrypt, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

type ScryptOpts = { N: number; r: number; p: number; maxmem: number };
const scryptAsync = promisify(scrypt) as unknown as (
  password: string, salt: Buffer, keylen: number, options: ScryptOpts,
) => Promise<Buffer>;

/** OWASP-recommended scrypt parameters. N=2^16 is ~64MB per hash. */
const N = 65536;
const r = 8;
const p = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

/**
 * scrypt rather than bcrypt or argon2: it is in Node's standard library, so there is
 * no native module to compile and no binary to ship to a serverless runtime — while
 * still being memory-hard and resistant to GPU cracking.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LEN, { N, r, p, maxmem: 128 * N * r * 2 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, nStr, rStr, pStr, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt' || !nStr || !rStr || !pStr || !saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    const nVal = Number(nStr);
    const derived = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
      N: nVal, r: Number(rStr), p: Number(pStr), maxmem: 128 * nVal * Number(rStr) * 2,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Session tokens are stored only as a hash, so a database leak yields nothing usable. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Signs a cookie value so a tampered session id is rejected before any DB lookup. */
export function sign(value: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${mac}`;
}

export function unsign(signed: string, secret: string): string | null {
  const idx = signed.lastIndexOf('.');
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = createHmac('sha256', secret).update(value).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return value;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

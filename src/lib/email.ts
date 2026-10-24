import 'server-only';
import { env } from '@/lib/env';

/**
 * Sending email, through Resend's HTTP API (no SDK needed for one call).
 *
 * Returns false rather than throwing when email is not configured, so callers can
 * say "not set up yet" instead of failing a request.
 */
export function emailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  if (!emailConfigured()) return false;
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error('Email send failed: could not reach Resend', error instanceof Error ? error.message : error);
    return false;
  }
  if (!res.ok) {
    // The reason goes to the server log only; it can name the account's settings.
    console.error('Email send failed', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return false;
  }
  return true;
}

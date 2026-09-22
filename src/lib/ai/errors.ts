/**
 * A provider failure, in words a person can act on.
 *
 * The raw Anthropic error — `400 {"type":"error","error":{...}}` — was reaching the
 * chat panel verbatim. That is useless to someone asking about their budget and
 * leaks request ids besides. The account owner still needs the real reason, so it
 * is kept in `detail` for Settings → Integrations and the server log, and the person
 * in the chat gets a sentence.
 */
export interface ProviderProblem {
  /** Shown in the chat. */
  message: string;
  /** Shown to whoever runs the deployment. */
  detail: string;
  status: number;
}

export function describeProviderError(error: unknown): ProviderProblem {
  const raw = error instanceof Error ? error.message : String(error);
  const text = raw.toLowerCase();

  if (text.includes('credit balance is too low') || text.includes('billing')) {
    return {
      message: 'Pock is resting — the AI account behind this app has run out of credit. Everything else in Pockit still works.',
      detail: 'The Anthropic account has no credit left. Add credit at console.anthropic.com → Plans & Billing; no redeploy is needed.',
      status: 503,
    };
  }
  if (text.includes('authentication') || text.includes('invalid x-api-key') || text.includes('401')) {
    return {
      message: 'Pock is not connected properly right now. Everything else in Pockit still works.',
      detail: 'ANTHROPIC_API_KEY was rejected. Re-copy it from console.anthropic.com, check for stray quotes or spaces, and redeploy.',
      status: 503,
    };
  }
  if (text.includes('rate limit') || text.includes('429') || text.includes('overloaded') || text.includes('529')) {
    return {
      message: 'Pock is busy for a moment. Try again in a few seconds.',
      detail: 'The provider is rate-limiting or overloaded. This usually clears on its own.',
      status: 503,
    };
  }
  if (text.includes('model') && (text.includes('not found') || text.includes('404'))) {
    return {
      message: 'Pock is not connected properly right now. Everything else in Pockit still works.',
      detail: 'The configured AI_MODEL does not exist for this account. Unset AI_MODEL to use the default.',
      status: 503,
    };
  }
  return {
    message: 'Pock could not answer just now. Try again in a moment.',
    detail: raw.slice(0, 300),
    status: 502,
  };
}

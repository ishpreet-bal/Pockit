import 'server-only';
import { env } from '@/lib/env';
import type { AiProvider } from './types';
import { HeuristicProvider } from './heuristic';
import { AnthropicProvider } from './anthropic';

let cached: AiProvider | undefined;

/**
 * Chooses a provider from configuration.
 *
 * `auto` prefers a configured vision model and falls back to on-device parsing, so
 * the app works with no configuration at all and gets better when a key is added.
 */
export function getAiProvider(): AiProvider {
  if (cached) return cached;

  const choice = env.AI_PROVIDER;
  if (choice === 'heuristic') {
    cached = new HeuristicProvider();
  } else if (choice === 'anthropic' || (choice === 'auto' && env.ANTHROPIC_API_KEY)) {
    cached = env.ANTHROPIC_API_KEY
      ? new AnthropicProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL)
      : new HeuristicProvider();
  } else {
    // OpenAI is a declared option in the configuration but is not implemented yet;
    // falling back is better than failing an import the heuristic path can handle.
    cached = new HeuristicProvider();
  }

  return cached;
}

/** For tests and for switching provider without a process restart. */
export function resetAiProvider(): void {
  cached = undefined;
}

export * from './types';
export { HeuristicProvider } from './heuristic';

import 'server-only';
import { env } from '@/lib/env';
import type { AiProvider } from './types';
import { HeuristicProvider } from './heuristic';
import { AnthropicProvider } from './anthropic';
import { OpenAiProvider } from './openai';

let cached: AiProvider | undefined;

/**
 * Chooses a provider from configuration.
 *
 * `auto` prefers a configured model (Claude first, then OpenAI) and falls back to
 * on-device parsing, so the app works with no configuration at all and gets better
 * when a key is added. Naming a provider whose key is missing also falls back.
 */
export function getAiProvider(): AiProvider {
  if (cached) return cached;
  cached = choose();
  return cached;
}

function choose(): AiProvider {
  const choice = env.AI_PROVIDER;
  const claude = () => new AnthropicProvider(env.ANTHROPIC_API_KEY!, env.AI_MODEL);
  const openai = () => new OpenAiProvider(env.OPENAI_API_KEY!, env.OPENAI_MODEL);

  if (choice === 'heuristic') return new HeuristicProvider();
  if (choice === 'anthropic') return env.ANTHROPIC_API_KEY ? claude() : new HeuristicProvider();
  if (choice === 'openai') return env.OPENAI_API_KEY ? openai() : new HeuristicProvider();
  if (env.ANTHROPIC_API_KEY) return claude();
  if (env.OPENAI_API_KEY) return openai();
  return new HeuristicProvider();
}

/** For tests and for switching provider without a process restart. */
export function resetAiProvider(): void {
  cached = undefined;
}

export * from './types';
export { HeuristicProvider } from './heuristic';

import Anthropic from "@anthropic-ai/sdk";
import type { TokenUsage } from "./classify/types";

declare global {
  var __aminaAnthropic: Anthropic | undefined;
}

/**
 * Singleton Anthropic client, cached on `global` so Next.js dev-mode module
 * reloads don't construct a new client per request. Reads ANTHROPIC_API_KEY
 * from the environment.
 */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Required for Stage 2/3 (LLM classify/analysis). " +
        "Get a key at https://console.anthropic.com/ and set it in .env.local."
    );
  }
  if (!global.__aminaAnthropic) {
    global.__aminaAnthropic = new Anthropic();
  }
  return global.__aminaAnthropic;
}

/**
 * Per-model token pricing (USD per token), from the pricing cache in the
 * claude-api skill (2026-06-04). Update if pricing changes. Stage 2 uses
 * Haiku 4.5; Stage 3 uses Sonnet 4.6.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0 / 1_000_000, output: 5.0 / 1_000_000 },
  "claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
};

export function tokenUsageFor(model: string, usage: Anthropic.Usage): TokenUsage {
  const price = PRICING[model] ?? { input: 0, output: 0 };
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  return {
    inputTokens,
    outputTokens,
    costUsd: inputTokens * price.input + outputTokens * price.output,
  };
}

export function sumUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

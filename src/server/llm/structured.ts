import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, sumUsage, tokenUsageFor } from "../anthropic";
import { logLlmCall } from "../classify/store";
import type { LlmStage, TokenUsage } from "../classify/types";

/**
 * Shared structured-LLM harness. Every new LLM feature in this codebase goes
 * through here so the CLAUDE.md non-negotiables are structural, not per-call
 * discipline:
 *
 *  - **Structured output, enforced not requested** — a forced tool call
 *    (`tool_choice`) is the only allowed response shape.
 *  - **Reasoning + confidence + citations** — supplied by the caller's tool
 *    schema; this harness guarantees the call *fails* (and is logged as a
 *    failure) rather than silently accepting malformed output.
 *  - **Reject/retry, never relax** — one retry with the validation error fed
 *    back; if the second attempt still fails, no output is returned.
 *  - **Cost is always logged** — exactly one `llm_calls` row per invocation,
 *    success or failure, with cumulative token usage, so the call rolls into the
 *    cost-per-1000-alerts metric. There is no way to call the model from a
 *    feature without this happening.
 *
 * Grounding (checking that cited ids are real) is the caller's job inside
 * `parse`, because only the caller knows the valid id set — but the harness
 * makes a failed grounding check a first-class retry/reject, same as a schema
 * violation. The existing Stage 2/3 and AML-narrate paths predate this helper
 * and already implement the same contract by hand; new call sites use this.
 */

const MAX_TOKENS = 1024;

export interface StructuredCall<T> {
  stage: LlmStage;
  model: string;
  system: string;
  tool: Anthropic.Tool;
  userContent: string;
  /**
   * Validate + ground the model's raw tool input. Return `{ output }` to accept,
   * or `{ error }` to trigger the single retry / final rejection. This is where
   * the caller runs its Zod schema and checks citation ids against the real,
   * provided evidence set — never trusting the model's claimed sources.
   */
  parse: (raw: unknown) => { output: T } | { error: string };
  /** Signal.id to attach to the audit row (a real ingested id, or null for non-signal stages). */
  signalId?: string | null;
}

export interface StructuredResult<T> {
  output: T | null;
  tokenUsage: TokenUsage;
  error: string | null;
}

export async function callStructuredLlm<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
  const client = getAnthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: call.userContent }];
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  let lastError = "no response";

  const log = (success: boolean, error: string | null) =>
    logLlmCall({
      stage: call.stage,
      model: call.model,
      signalId: call.signalId ?? null,
      tokenUsage: usage,
      success,
      error,
    });

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: call.model,
        max_tokens: MAX_TOKENS,
        system: call.system,
        tools: [call.tool],
        tool_choice: { type: "tool", name: call.tool.name },
        messages,
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await log(false, lastError);
      return { output: null, tokenUsage: usage, error: lastError };
    }

    usage = sumUsage(usage, tokenUsageFor(call.model, response.usage));

    const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const result = call.parse(block?.input);
    if ("output" in result) {
      await log(true, null);
      return { output: result.output, tokenUsage: usage, error: null };
    }

    lastError = result.error;
    if (attempt === 0) {
      messages.push({ role: "assistant", content: response.content });
      // The previous turn left a `tool_use` block open — the API requires the very
      // next message to resolve it with a matching `tool_result` before any new
      // instruction, or the request is rejected outright (no retry would ever fire).
      messages.push({
        role: "user",
        content: block
          ? [
              {
                type: "tool_result",
                tool_use_id: block.id,
                content: `Invalid: ${result.error}. Call ${call.tool.name} again with a corrected response.`,
                is_error: true,
              },
            ]
          : `Your previous response was invalid: ${result.error}. Call ${call.tool.name} again with a corrected response.`,
      });
    }
  }

  await log(false, lastError);
  return { output: null, tokenUsage: usage, error: lastError };
}

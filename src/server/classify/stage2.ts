import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, sumUsage, tokenUsageFor } from "../anthropic";
import type { ClassifiedSignal } from "../filter";
import { RISK_TAXONOMY } from "../filter/taxonomy";
import { Stage2OutputSchema, type Stage2Output, type TokenUsage } from "./types";

/**
 * Stage 2 LLM classify: a cheap/fast model judges whether a signal that
 * survived Stage 1 is a real risk flag, grounded only in that signal. Per
 * CLAUDE.md's non-negotiables: structured output only (tool-use forces the
 * shape), reject/retry on schema violation rather than relaxing the schema,
 * and citations must reference a real ingested Signal.id — never trusted
 * blindly, always checked against the signal actually given to the model.
 */

export const STAGE2_MODEL = "claude-haiku-4-5";

const TOOL_NAME = "submit_risk_assessment";

const TAXONOMY_DESCRIPTION = RISK_TAXONOMY.map((c) => `- ${c.id}: ${c.label} — ${c.description}`).join("\n");

const SYSTEM_PROMPT = `You are a KYC/AML risk classification assistant for a bank's risk monitoring system.
You will be given exactly one ingested news/sanctions signal that was retrieved by searching for a
named entity. Decide whether it represents a genuine risk flag for that entity, grounded ONLY in the
text provided — never invent facts, dates, or details not present in the signal.

First, judge entity relevance. The signal was matched to the entity by a name search, which can produce
false positives: a different company with the same name, a person rather than the company, or a passing
mention where the entity is not the subject. Set concernsEntity=false in those cases — do not raise a
risk flag for the wrong entity.

If the signal is routine/non-risk-relevant noise (but genuinely about the entity), set concernsEntity=true,
pick your best-fit category, set a low confidence score, and recommend dismissal in recommendedAction.

Calibrate confidence using corroboration: a story reported independently by multiple sources is stronger
evidence than a single source. The prompt tells you how many independent sources reported this signal.

Risk categories:
${TAXONOMY_DESCRIPTION}

Always respond by calling the ${TOOL_NAME} tool — never respond with plain text.`;

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit a structured risk assessment for the given signal.",
  input_schema: {
    type: "object",
    properties: {
      concernsEntity: {
        type: "boolean",
        description:
          "True only if the signal is genuinely about the named entity as its subject. " +
          "False for same-name different companies, people vs. the company, or passing mentions.",
      },
      flagType: {
        type: "string",
        enum: RISK_TAXONOMY.map((c) => c.id),
        description: "Best-fit risk category id for this signal.",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence that this is a genuine, actionable risk flag (not noise).",
      },
      citationSignalIds: {
        type: "array",
        items: { type: "string" },
        description: "Signal id(s) this assessment is grounded in. Must only include ids you were given.",
      },
      rationale: {
        type: "string",
        description: "Human-readable explanation grounded in the signal text.",
      },
      recommendedAction: {
        type: "string",
        description: "What a compliance analyst should do next.",
      },
    },
    required: ["concernsEntity", "flagType", "confidence", "citationSignalIds", "rationale", "recommendedAction"],
  },
};

function buildSignalPrompt(signal: ClassifiedSignal): string {
  // 1 (the original source) + any sources that independently reported the same
  // story, recorded by the dedup store in mergedSources.
  const independentSources = 1 + (signal.mergedSources?.length ?? 0);
  const corroboration =
    independentSources > 1
      ? `Independent sources reporting this: ${independentSources} (${[signal.source, ...(signal.mergedSources ?? [])].join(", ")})`
      : `Independent sources reporting this: 1 (${signal.source})`;
  return [
    `Signal id: ${signal.id}`,
    `Entity searched for: ${signal.entityHint}`,
    `Source: ${signal.source}`,
    corroboration,
    `Title: ${signal.title}`,
    signal.snippet ? `Snippet: ${signal.snippet}` : null,
    `Published: ${signal.publishedAt ?? "unknown"}`,
    `Stage 1 keyword match: ${signal.stage1.topMatch?.categoryLabel ?? "none"} (score ${signal.stage1.topMatch?.score.toFixed(2) ?? "0"})`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface Stage2Result {
  output: Stage2Output | null;
  tokenUsage: TokenUsage;
  error: string | null;
}

/**
 * Shared per-signal request body, used by both the synchronous path and the
 * Batches path so the prompt/tool/grounding contract is identical regardless of
 * how the request is dispatched.
 */
export function buildStage2Request(
  signal: ClassifiedSignal
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: STAGE2_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildSignalPrompt(signal) }],
  };
}

export function extractToolUse(response: Anthropic.Message): Anthropic.ToolUseBlock | undefined {
  return response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
}

export function extractToolInput(response: Anthropic.Message): unknown {
  return extractToolUse(response)?.input;
}

export function validateStage2(
  raw: unknown,
  validSignalIds: Set<string>
): { output: Stage2Output } | { error: string } {
  const parsed = Stage2OutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: `Schema violation: ${parsed.error.message}` };
  }
  const badCitations = parsed.data.citationSignalIds.filter((id) => !validSignalIds.has(id));
  if (badCitations.length > 0) {
    return { error: `Citation(s) not in the provided signal set: ${badCitations.join(", ")}` };
  }
  return { output: parsed.data };
}

/**
 * Classifies one signal. Retries once with the validation error appended if
 * the model's output fails schema or grounding checks — never silently
 * accepts malformed output. Returns output: null (with the cumulative token
 * usage from both attempts) if both attempts fail.
 */
export async function classifySignalWithLlm(signal: ClassifiedSignal): Promise<Stage2Result> {
  const client = getAnthropic();
  const validSignalIds = new Set([signal.id]);

  const base = buildStage2Request(signal);
  const messages: Anthropic.MessageParam[] = [...base.messages];

  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({ ...base, messages });
    usage = sumUsage(usage, tokenUsageFor(STAGE2_MODEL, response.usage));

    const block = extractToolUse(response);
    const result = validateStage2(block?.input, validSignalIds);
    if ("output" in result) {
      return { output: result.output, tokenUsage: usage, error: null };
    }

    if (attempt === 0) {
      messages.push({ role: "assistant", content: response.content });
      // Must resolve the open `tool_use` block with a `tool_result` before any new
      // instruction, or the API rejects the next request and the retry never fires.
      messages.push({
        role: "user",
        content: block
          ? [
              {
                type: "tool_result",
                tool_use_id: block.id,
                content: `Invalid: ${result.error}. Call ${TOOL_NAME} again with a corrected response.`,
                is_error: true,
              },
            ]
          : `Your previous response was invalid: ${result.error}. Call ${TOOL_NAME} again with a corrected response.`,
      });
      continue;
    }

    return { output: null, tokenUsage: usage, error: result.error };
  }

  return { output: null, tokenUsage: usage, error: "unreachable" };
}

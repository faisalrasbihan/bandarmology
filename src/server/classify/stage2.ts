import Anthropic from "@anthropic-ai/sdk";
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

const MODEL = "claude-haiku-4-5";
// Per shared/models.md pricing cache (2026-06-04): Haiku 4.5 is $1.00/1M input, $5.00/1M output.
const INPUT_COST_PER_TOKEN = 1.0 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 5.0 / 1_000_000;

const TOOL_NAME = "submit_risk_assessment";

const TAXONOMY_DESCRIPTION = RISK_TAXONOMY.map((c) => `- ${c.id}: ${c.label} — ${c.description}`).join("\n");

const SYSTEM_PROMPT = `You are a KYC/AML risk classification assistant for a bank's risk monitoring system.
You will be given exactly one ingested news/sanctions signal. Decide whether it represents a genuine
risk flag for the entity it concerns, grounded ONLY in the text provided — never invent facts, dates,
or details not present in the signal. If the signal is routine/non-risk-relevant noise, still respond
with your best-fit category but set a low confidence score and recommend dismissal in recommendedAction.

Risk categories:
${TAXONOMY_DESCRIPTION}

Always respond by calling the ${TOOL_NAME} tool — never respond with plain text.`;

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit a structured risk assessment for the given signal.",
  input_schema: {
    type: "object",
    properties: {
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
    required: ["flagType", "confidence", "citationSignalIds", "rationale", "recommendedAction"],
  },
};

function buildSignalPrompt(signal: ClassifiedSignal): string {
  return [
    `Signal id: ${signal.id}`,
    `Entity: ${signal.entityHint}`,
    `Source: ${signal.source}`,
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

function tokenUsageFrom(usage: Anthropic.Usage): TokenUsage {
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  return {
    inputTokens,
    outputTokens,
    costUsd: inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN,
  };
}

function sumUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

function extractToolInput(response: Anthropic.Message): unknown {
  const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  return block?.input;
}

function validate(raw: unknown, validSignalIds: Set<string>): { output: Stage2Output } | { error: string } {
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
  const client = new Anthropic();
  const validSignalIds = new Set([signal.id]);

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildSignalPrompt(signal) }];

  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages,
    });
    usage = sumUsage(usage, tokenUsageFrom(response.usage));

    const raw = extractToolInput(response);
    const result = validate(raw, validSignalIds);
    if ("output" in result) {
      return { output: result.output, tokenUsage: usage, error: null };
    }

    if (attempt === 0) {
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: `Your previous response was invalid: ${result.error}. Call ${TOOL_NAME} again with a corrected response.`,
      });
      continue;
    }

    return { output: null, tokenUsage: usage, error: result.error };
  }

  return { output: null, tokenUsage: usage, error: "unreachable" };
}

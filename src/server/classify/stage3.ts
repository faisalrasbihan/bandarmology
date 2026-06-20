import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, sumUsage, tokenUsageFor } from "../anthropic";
import type { KycBaseline } from "../baseline/types";
import type { Signal } from "../signals/types";
import { DRIFT_SEVERITIES, DRIFT_TYPES, Stage3OutputSchema, type Stage3Output, type TokenUsage } from "./types";
import type { Alert } from "./types";

/**
 * Stage 3 deep analysis (escalated cases only, rare, higher cost). This is the
 * ONE place Layer 1 (the public signal + its Stage 2 alert) and Layer 2 (the
 * simulated KYC baseline) are combined — an explicit, auditable join, logged
 * via llm_calls. A stronger model (Sonnet 4.6) diffs the observed public
 * footprint against onboarding assumptions to detect KYC drift.
 *
 * Same enforce-don't-trust contract as Stage 2: forced tool call, Zod
 * validation, citation grounding checked against the real signal id, retry once.
 */

export const STAGE3_MODEL = "claude-sonnet-4-6";

const TOOL_NAME = "submit_drift_analysis";

const SYSTEM_PROMPT = `You are a senior KYC/AML analyst performing deep "KYC drift" analysis for a bank.
You are given (1) the internal KYC baseline recorded when an entity was onboarded, and (2) a recent
public risk signal about that entity that has already been flagged. Your job is to determine whether the
entity's current public footprint has drifted away from the assumptions made at onboarding — the slow,
dangerous kind of change that invalidates the original risk rating and transaction-monitoring thresholds.

Compare the observed signal against each baseline dimension (business model, sectors, jurisdiction,
ownership, expected transaction volume, risk rating). Ground everything ONLY in the baseline and the
signal text provided — never invent facts. Produce a per-dimension comparison, an overall drift
determination with severity, and a concise case narrative an analyst can act on.

Drift types: ${DRIFT_TYPES.join(", ")}.
Severities: ${DRIFT_SEVERITIES.join(", ")}.

Always respond by calling the ${TOOL_NAME} tool — never respond with plain text.`;

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit a structured KYC-drift analysis comparing the signal against the baseline.",
  input_schema: {
    type: "object",
    properties: {
      driftDetected: { type: "boolean", description: "True if the public footprint has materially drifted from the baseline." },
      driftType: { type: "string", enum: [...DRIFT_TYPES], description: "Primary kind of drift, or 'none'." },
      severity: { type: "string", enum: [...DRIFT_SEVERITIES], description: "Severity of the drift." },
      confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence in this assessment." },
      comparison: {
        type: "array",
        description: "Per-dimension comparison of baseline vs. observed.",
        items: {
          type: "object",
          properties: {
            dimension: { type: "string", description: "e.g. business model, jurisdiction, ownership, risk rating." },
            expected: { type: "string", description: "What the baseline said." },
            observed: { type: "string", description: "What the signal shows (or 'no change indicated')." },
            changed: { type: "boolean", description: "Whether this dimension has drifted." },
          },
          required: ["dimension", "expected", "observed", "changed"],
        },
      },
      narrative: { type: "string", description: "Concise case narrative for an analyst." },
      recommendedAction: { type: "string", description: "What the analyst should do next." },
      citationSignalIds: {
        type: "array",
        items: { type: "string" },
        description: "Signal id(s) grounding this analysis. Must only include ids you were given.",
      },
    },
    required: [
      "driftDetected",
      "driftType",
      "severity",
      "confidence",
      "comparison",
      "narrative",
      "recommendedAction",
      "citationSignalIds",
    ],
  },
};

function buildPrompt(alert: Alert, signal: Signal, baseline: KycBaseline): string {
  return [
    "=== Layer 2 — KYC baseline (onboarding) ===",
    `Company: ${baseline.companyName}`,
    `Expected sectors: ${baseline.expectedSectors.join(", ") || "n/a"}`,
    `Expected countries: ${baseline.expectedCountries.join(", ") || "n/a"}`,
    `Expected business model: ${baseline.expectedBusinessModel}`,
    `Expected tx volume: ${baseline.expectedTxVolumeRange}`,
    `Ownership structure: ${baseline.ownershipStructure.join("; ") || "n/a"}`,
    `Onboarding risk rating: ${baseline.riskRating}`,
    `Onboarded at: ${baseline.onboardedAt}`,
    "",
    "=== Layer 1 — flagged public signal ===",
    `Signal id: ${signal.id}`,
    `Stage 2 flag: ${alert.flagType} (confidence ${alert.confidence})`,
    `Stage 2 rationale: ${alert.rationale}`,
    `Source: ${signal.source}`,
    `Title: ${signal.title}`,
    signal.snippet ? `Snippet: ${signal.snippet}` : "",
    `Published: ${signal.publishedAt ?? "unknown"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface Stage3Result {
  output: Stage3Output | null;
  tokenUsage: TokenUsage;
  error: string | null;
}

function extractToolInput(response: Anthropic.Message): unknown {
  const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  return block?.input;
}

function validate(raw: unknown, validSignalIds: Set<string>): { output: Stage3Output } | { error: string } {
  const parsed = Stage3OutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: `Schema violation: ${parsed.error.message}` };
  }
  const bad = parsed.data.citationSignalIds.filter((id) => !validSignalIds.has(id));
  if (bad.length > 0) {
    return { error: `Citation(s) not in the provided signal set: ${bad.join(", ")}` };
  }
  return { output: parsed.data };
}

export async function analyzeDrift(alert: Alert, signal: Signal, baseline: KycBaseline): Promise<Stage3Result> {
  const client = getAnthropic();
  const validSignalIds = new Set([signal.id]);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildPrompt(alert, signal, baseline) }];

  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: STAGE3_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages,
    });
    usage = sumUsage(usage, tokenUsageFor(STAGE3_MODEL, response.usage));

    const result = validate(extractToolInput(response), validSignalIds);
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

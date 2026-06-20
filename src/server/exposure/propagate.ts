import Anthropic from "@anthropic-ai/sdk";
import { callStructuredLlm } from "../llm/structured";
import { getStoredSignals } from "../signals";
import type { Signal } from "../signals/types";
import { createExposureAlert, getExposureEdges } from "./store";
import {
  ExposureImpactSchema,
  PROPAGATABLE_TAG_TYPES,
  type ExposureAlert,
  type ExposureEdge,
  type ExposureImpact,
} from "./types";

/**
 * Second-order exposure propagation. A public signal can endanger a client it
 * never names — by hitting one of the client's public exposure edges (a shared
 * director, supplier, subsidiary, regulator…). This is the explainability
 * payoff: an alert whose provenance is a full chain, Signal.id → exposure edge →
 * client.
 *
 * Staged-by-cost, like the rest of the pipeline:
 *  1. FREE pre-filter — only edges whose tagValue literally appears in the signal
 *     text become candidates. No LLM is spent on the long tail.
 *  2. LLM materiality judgement — a cheap model decides whether the mention is a
 *     genuine, material risk to the exposed client (vs. a tangential mention),
 *     with reasoning + confidence, grounded to the signal id. Every call (incl.
 *     "not material" verdicts) is token-logged via the shared harness.
 *
 * First-order coverage (a signal that names the client directly) is Stage 2's
 * job; propagation deliberately skips edges back to the signal's own entity.
 */

export const EXPOSURE_MODEL = "claude-haiku-4-5";
const TOOL_NAME = "submit_exposure_impact";
/** Below this, a "material" verdict isn't confident enough to raise an alert. */
const MIN_CONFIDENCE = 0.5;

const SYSTEM_PROMPT = `You are a KYC/AML risk analyst assessing INDIRECT (second-order) exposure for a bank.
A client is linked to a public entity (a director, supplier, customer, subsidiary, or regulator). A public
news/sanctions signal mentions that linked entity. Decide whether the signal represents a genuine, MATERIAL
risk to the CLIENT through that link — not whether it is about the linked entity (it is, by construction).

Set materiallyImpacts=false for tangential or positive mentions, or where the link does not plausibly
transmit risk to the client. Ground your reasoning ONLY in the signal text provided; never invent facts.
Cite the signal id you were given. Always respond by calling the ${TOOL_NAME} tool.`;

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Judge whether a public signal materially impacts a client through an indirect exposure.",
  input_schema: {
    type: "object",
    properties: {
      materiallyImpacts: {
        type: "boolean",
        description: "True only if the signal is a genuine, material risk to the client via this exposure.",
      },
      confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence in the materiality judgement." },
      rationale: { type: "string", description: "Reasoning grounded in the signal text, naming the exposure link." },
      recommendedAction: { type: "string", description: "What a compliance analyst should do next." },
      citationSignalIds: {
        type: "array",
        items: { type: "string" },
        description: "Signal id(s) this judgement is grounded in. Must only include ids you were given.",
      },
    },
    required: ["materiallyImpacts", "confidence", "rationale", "recommendedAction", "citationSignalIds"],
  },
};

function buildPrompt(signal: Signal, edge: ExposureEdge): string {
  return [
    `Client under monitoring: ${edge.entityName}`,
    `Exposure link: ${edge.entityName} is linked to "${edge.tagValue}" as a ${edge.tagType} (source: ${edge.source}, confidence ${edge.confidence}).`,
    ``,
    `A public signal mentions "${edge.tagValue}":`,
    `Signal id: ${signal.id}`,
    `Source: ${signal.source}`,
    `Title: ${signal.title}`,
    signal.snippet ? `Snippet: ${signal.snippet}` : null,
    `Published: ${signal.publishedAt ?? "unknown"}`,
    ``,
    `Does this signal represent a material risk to ${edge.entityName} through this link?`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Word-boundary, case-insensitive mention test for the free pre-filter. */
function mentions(text: string, value: string): boolean {
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${esc}(\\W|$)`, "i").test(text);
}

async function judgeAndCreate(signal: Signal, edge: ExposureEdge): Promise<ExposureAlert | null> {
  const validIds = new Set([signal.id]);
  const { output, tokenUsage } = await callStructuredLlm<ExposureImpact>({
    stage: "exposure",
    model: EXPOSURE_MODEL,
    system: SYSTEM_PROMPT,
    tool: TOOL,
    userContent: buildPrompt(signal, edge),
    signalId: signal.id,
    parse: (raw) => {
      const parsed = ExposureImpactSchema.safeParse(raw);
      if (!parsed.success) return { error: `Schema violation: ${parsed.error.message}` };
      const bad = parsed.data.citationSignalIds.filter((id) => !validIds.has(id));
      if (bad.length > 0) return { error: `Citation(s) not in the provided signal set: ${bad.join(", ")}` };
      return { output: parsed.data };
    },
  });

  if (!output || !output.materiallyImpacts || output.confidence < MIN_CONFIDENCE) return null;
  return createExposureAlert({
    entityName: edge.entityName,
    tagType: edge.tagType,
    tagValue: edge.tagValue,
    signalId: signal.id,
    impact: output,
    model: EXPOSURE_MODEL,
    tokenUsage,
  });
}

export interface PropagationResult {
  alerts: ExposureAlert[];
  signalsScanned: number;
  candidatesEvaluated: number;
}

/**
 * Runs propagation across stored signals. `sourceEntity` limits the *source*
 * signals scanned (e.g. only signals ingested while monitoring Wirecard);
 * targets are always other clients. `limit` caps the number of signals scanned.
 */
export async function propagateAcrossSignals(opts?: {
  sourceEntity?: string;
  limit?: number;
}): Promise<PropagationResult> {
  const [edges, signals] = await Promise.all([
    getExposureEdges(),
    getStoredSignals(opts?.sourceEntity ? { entityHint: opts.sourceEntity } : undefined),
  ]);
  const propagatable = edges.filter((e) => PROPAGATABLE_TAG_TYPES.includes(e.tagType));
  const scan = opts?.limit ? signals.slice(0, opts.limit) : signals;

  const alerts: ExposureAlert[] = [];
  let candidatesEvaluated = 0;

  for (const signal of scan) {
    const text = `${signal.title} ${signal.snippet ?? ""}`;
    const candidates = propagatable.filter(
      (e) => e.entityName.toLowerCase() !== signal.entityHint.toLowerCase() && mentions(text, e.tagValue)
    );
    for (const edge of candidates) {
      candidatesEvaluated++;
      const alert = await judgeAndCreate(signal, edge);
      if (alert) alerts.push(alert);
    }
  }

  return { alerts, signalsScanned: scan.length, candidatesEvaluated };
}

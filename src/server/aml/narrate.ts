import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, tokenUsageFor } from "../anthropic";
import { getBaselineByCompany } from "../baseline";
import { logLlmCall } from "../classify/store";
import { getFindingById, getTransactions, setFindingNarrative } from "./store";
import { AML_FLAG_LABEL, type AmlFinding, type Transaction } from "./types";

/**
 * Optional Stage-2-analog LLM narration for an AML finding. The rule engine has
 * already detected and grounded the finding for free; this adds a human-readable
 * case narrative and a calibrated confidence, reasoning over the *flagged
 * transactions* plus the entity's KYC baseline (an explicit, logged Layer-2
 * internal join — both sides are internal, so no public-data leak). Same
 * enforce-don't-trust contract as the news pipeline: forced tool call, and the
 * model may only cite transaction ids it was actually given. Every call is
 * logged via logLlmCall so AML spend rolls into the cost-per-1000 metric.
 */

const AML_NARRATE_MODEL = "claude-haiku-4-5";
const TOOL_NAME = "submit_aml_narrative";

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit a structured AML case narrative for the flagged transaction pattern.",
  input_schema: {
    type: "object",
    properties: {
      confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence this is genuine suspicious activity." },
      narrative: { type: "string", description: "Concise case narrative grounded only in the transactions and baseline given." },
      recommendedAction: { type: "string", description: "What an AML analyst should do next." },
      citationTxIds: {
        type: "array",
        items: { type: "string" },
        description: "Transaction id(s) this narrative is grounded in. Must only include ids you were given.",
      },
    },
    required: ["confidence", "narrative", "recommendedAction", "citationTxIds"],
  },
};

function buildPrompt(finding: AmlFinding, evidence: Transaction[], baselineText: string): string {
  const lines = evidence
    .slice(0, 30)
    .map(
      (t) =>
        `- ${t.id} | ${t.ts.slice(0, 10)} | ${t.direction} | $${Math.round(t.amountUsd).toLocaleString("en-US")} | ${t.counterparty} (${t.counterpartyCountry})${t.crossBorder ? " | cross-border" : ""} | ${t.channel}`
    )
    .join("\n");
  return [
    `Entity: ${finding.entityName}`,
    `Detected pattern: ${AML_FLAG_LABEL[finding.flagType]}`,
    `Rule rationale: ${finding.rationale}`,
    `Detector metrics: ${JSON.stringify(finding.metrics)}`,
    ``,
    `KYC baseline (Layer 2, internal): ${baselineText || "none on file"}`,
    ``,
    `Flagged transactions:`,
    lines,
  ].join("\n");
}

export interface NarrateResult {
  finding: AmlFinding | null;
  error: string | null;
}

export async function narrateFinding(findingId: string): Promise<NarrateResult> {
  const finding = await getFindingById(findingId);
  if (!finding) return { finding: null, error: "Finding not found" };

  const [allTx, baseline] = await Promise.all([
    getTransactions(finding.entityName),
    getBaselineByCompany(finding.entityName),
  ]);
  const evidenceIds = new Set(finding.evidenceTxIds);
  const evidence = allTx.filter((t) => evidenceIds.has(t.id));
  const baselineText = baseline
    ? `${baseline.expectedBusinessModel} Expected activity: ${baseline.expectedTxVolumeRange}. Risk rating: ${baseline.riskRating}.`
    : "";

  const client = getAnthropic();
  const system =
    "You are an AML analyst assistant. A statistical rule has flagged a transaction pattern. Write a concise, " +
    "factual case narrative grounded ONLY in the transactions and KYC baseline provided — never invent amounts, " +
    "counterparties, or dates. Cite the transaction ids your narrative relies on. Always respond via the tool.";

  try {
    const response = await client.messages.create({
      model: AML_NARRATE_MODEL,
      max_tokens: 1024,
      system,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: buildPrompt(finding, evidence, baselineText) }],
    });
    const usage = tokenUsageFor(AML_NARRATE_MODEL, response.usage);

    const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const input = block?.input as
      | { confidence: number; narrative: string; recommendedAction: string; citationTxIds: string[] }
      | undefined;

    if (!input || typeof input.narrative !== "string") {
      await logLlmCall({ stage: "aml", model: AML_NARRATE_MODEL, signalId: null, tokenUsage: usage, success: false, error: "No tool output" });
      return { finding, error: "Model returned no structured output" };
    }
    const badCitations = (input.citationTxIds ?? []).filter((id) => !evidenceIds.has(id));
    if (badCitations.length > 0) {
      await logLlmCall({ stage: "aml", model: AML_NARRATE_MODEL, signalId: null, tokenUsage: usage, success: false, error: `Bad citations: ${badCitations.join(", ")}` });
      return { finding, error: `Citation(s) not in the evidence set: ${badCitations.join(", ")}` };
    }

    const confidence = Math.max(0, Math.min(1, input.confidence));
    await setFindingNarrative(finding.id, input.narrative, AML_NARRATE_MODEL, confidence);
    await logLlmCall({ stage: "aml", model: AML_NARRATE_MODEL, signalId: null, tokenUsage: usage, success: true, error: null });

    return {
      finding: { ...finding, narrative: input.narrative, detectedBy: AML_NARRATE_MODEL, confidence, recommendedAction: input.recommendedAction || finding.recommendedAction },
      error: null,
    };
  } catch (err) {
    return { finding, error: err instanceof Error ? err.message : String(err) };
  }
}

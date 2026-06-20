import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { callStructuredLlm } from "../llm/structured";
import { buildInvestigation } from "./index";
import type { InvestigationView, TimelineEvent } from "./types";

/**
 * Optional on-demand LLM summary of an investigation. Reasons over the flagged
 * findings, the aggregated flows, and the merged internal + on-chain evidence,
 * producing a single analyst-facing narrative with a calibrated confidence —
 * grounded ONLY to transaction ids it was shown (the internal evidence rows and
 * the on-chain events in the window). Same enforce-don't-trust contract as the
 * rest of the system, run through the shared harness, so the call is token-logged
 * (stage "investigate") and rolls into the cost metric. Not persisted — this is a
 * read-time aid, regenerated on demand.
 */

const INVESTIGATE_MODEL = "claude-haiku-4-5";
const TOOL_NAME = "submit_investigation_summary";

const SummarySchema = z.object({
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
  citationTxIds: z.array(z.string()).min(1),
});
type Summary = z.infer<typeof SummarySchema>;

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit a concise investigation summary across the internal and on-chain evidence.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Concise narrative tying together the findings and the internal/on-chain evidence." },
      confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence this is genuine suspicious activity." },
      citationTxIds: {
        type: "array",
        items: { type: "string" },
        description: "Transaction id(s) this summary relies on. Must only include ids you were given.",
      },
    },
    required: ["summary", "confidence", "citationTxIds"],
  },
};

function describe(e: TimelineEvent): string {
  return `- ${e.id} | ${e.plane} | ${e.ts.slice(0, 10)} | ${e.direction} | $${e.amountUsd.toLocaleString("en-US")} | ${e.counterparty} | ${e.detail}${e.evidence ? " | EVIDENCE" : ""}${e.highRisk ? " | high-risk" : ""}`;
}

function buildPrompt(view: InvestigationView, shown: TimelineEvent[]): string {
  const findings = view.findings
    .map((f) => `- ${f.label} (${f.severity}): ${f.rationale}`)
    .join("\n");
  const flows = view.flows
    .map((c) => `- ${c.plane} ${c.direction} via ${c.label}: ${c.count} txns, $${c.totalUsd.toLocaleString("en-US")}${c.highRisk ? " (high-risk)" : ""}`)
    .join("\n");
  return [
    `Client: ${view.entityName}`,
    `Top severity: ${view.severity ?? "none"}`,
    view.window ? `Anomaly window: ${view.window.from.slice(0, 10)} → ${view.window.to.slice(0, 10)} (${view.window.days}d)` : "",
    ``,
    `Findings (internal AML monitoring, Layer 2):`,
    findings || "- none",
    ``,
    `Aggregated flows:`,
    flows || "- none",
    ``,
    `Transactions (internal = Layer 2, onchain = Layer 1 public ledger):`,
    shown.map(describe).join("\n"),
    ``,
    `Write a concise investigation summary connecting the internal pattern to the on-chain activity where relevant. Cite the transaction ids you rely on.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface NarrateInvestigationResult {
  view: InvestigationView;
  error: string | null;
}

export async function narrateInvestigation(entityName: string): Promise<NarrateInvestigationResult> {
  const view = await buildInvestigation(entityName);
  if (!view.hasActivity) return { view, error: "No transaction activity for this entity" };

  // Ground only to what the model is shown: the evidence rows plus the timeline.
  const shown = [...view.evidence, ...view.timeline.filter((e) => !e.evidence)].slice(0, 40);
  const validIds = new Set(shown.map((e) => e.id));

  const system =
    "You are an AML investigator assistant. Summarize the case grounded ONLY in the findings, flows, and " +
    "transactions provided — never invent amounts, counterparties, or dates. Cite the transaction ids your " +
    "summary relies on. Always respond via the tool.";

  const { output } = await callStructuredLlm<Summary>({
    stage: "investigate",
    model: INVESTIGATE_MODEL,
    system,
    tool: TOOL,
    userContent: buildPrompt(view, shown),
    signalId: null,
    parse: (raw) => {
      const parsed = SummarySchema.safeParse(raw);
      if (!parsed.success) return { error: `Schema violation: ${parsed.error.message}` };
      const bad = parsed.data.citationTxIds.filter((id) => !validIds.has(id));
      if (bad.length > 0) return { error: `Citation(s) not in the evidence set: ${bad.join(", ")}` };
      return { output: parsed.data };
    },
  });

  if (!output) return { view, error: "Model returned no valid structured output" };
  return { view: { ...view, narrative: output.summary, narrativeConfidence: output.confidence }, error: null };
}

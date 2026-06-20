/**
 * Layer 2 — simulated internal AML transaction monitoring. Like the KYC
 * baseline, this is sensitive internal data: it lives in its own module and its
 * own Postgres tables (`aml_transactions`, `aml_findings`) and is never merged
 * into the Layer 1 `signals` store. Detection runs entirely on Layer 2 data
 * (an entity's own transaction history + its KYC baseline) — no public signal
 * is read here, so there is no cross-layer leak. The dashboard join is the only
 * place AML findings meet Layer 1, read-only, for presentation.
 *
 * This is the transaction-behavioural half of the challenge's reference flags
 * (money mule, structuring, dormancy break) that the news/KYC-drift pipeline
 * cannot see, because the evidence is in transaction patterns, not the news.
 */

export type TxDirection = "inbound" | "outbound";
export type TxChannel = "wire" | "sepa" | "crypto" | "card" | "ach";

export interface Transaction {
  id: string;
  entityName: string;
  ts: string; // ISO timestamp
  amountUsd: number;
  direction: TxDirection;
  counterparty: string;
  counterpartyCountry: string; // ISO-3166 alpha-2
  crossBorder: boolean;
  channel: TxChannel;
  /** Always true — this is a simulated feed, never real customer data. */
  synthetic: true;
}

/** The three transaction-behavioural reference flags from the challenge brief. */
export type AmlFlagType = "money_mule" | "structuring_layering" | "dormancy_break";

/** Challenge-spec display label per flag. */
export const AML_FLAG_LABEL: Record<AmlFlagType, string> = {
  money_mule: "Behavioural Anomaly – Potential Money Mule",
  structuring_layering: "Structuring / Layering Risk",
  dormancy_break: "Dormancy Break – Suspicious Activation",
};

/** Challenge-spec recommended action per flag. */
export const AML_FLAG_ACTION: Record<AmlFlagType, string> = {
  money_mule: "Monitor transactions; flag for AML analyst review.",
  structuring_layering: "Trigger AML investigation.",
  dormancy_break: "Trigger AML review; validate business legitimacy.",
};

export type AmlSeverity = "low" | "medium" | "high" | "critical";
export type AmlStatus = "proposed" | "confirmed" | "escalated" | "dismissed";

export interface AmlFinding {
  id: string;
  entityName: string;
  flagType: AmlFlagType;
  severity: AmlSeverity;
  /** Heuristic confidence for a rules finding; the model's confidence once narrated. */
  confidence: number;
  /** Transaction ids that triggered this finding — the grounding/citation set. */
  evidenceTxIds: string[];
  /** Per-detector numbers behind the decision, surfaced for explainability. */
  metrics: Record<string, number | string>;
  rationale: string;
  recommendedAction: string;
  /** LLM narrative, populated only by the explicit narration step. */
  narrative: string | null;
  status: AmlStatus;
  /** "rules:aml-v1" for a rules finding; the model id once narrated. */
  detectedBy: string;
  createdAt: string;
}

/** Append-only audit record of a human moving a finding between statuses. */
export interface AmlFindingDecision {
  id: string;
  findingId: string;
  fromStatus: AmlStatus;
  toStatus: AmlStatus;
  actor: string;
  note: string | null;
  createdAt: string;
}

import type { AmlFlagType, AmlSeverity, AmlStatus } from "../aml";

/**
 * The investigation view's job is to put "everything on display" for an analyst
 * *without* burying the signal. So the shape is built for progressive disclosure,
 * not a raw transaction dump:
 *
 *   1. `findings`  — lead with the 1–3 flagged patterns, not the ledger.
 *   2. `flows`     — the anomaly is a *shape*; aggregate counterparty clusters
 *                    (sized by volume) so the pattern is visible at a glance.
 *   3. `evidence`  — only the transactions that actually triggered a finding,
 *                    expanded.
 *   4. `timeline`  — internal (Layer 2) and on-chain (Layer 1) events merged on
 *                    one axis, defaulted to the anomaly window, evidence marked.
 *   5. `ledger`    — full counts/totals for "show me everything" on demand.
 *
 * This is a READ-ONLY display join: it reads the Layer 2 internal feed/findings
 * and the Layer 1 public on-chain feed independently and merges them only here,
 * for presentation — the two planes are never written into each other.
 */

export type Plane = "internal" | "onchain";

export interface InvestigationWindow {
  from: string;
  to: string;
  days: number;
}

export interface FlowCluster {
  plane: Plane;
  /** Counterparty jurisdiction (internal) or on-chain attribution label. */
  label: string;
  direction: "inbound" | "outbound" | "mixed";
  totalUsd: number;
  count: number;
  highRisk: boolean;
}

export interface TimelineEvent {
  plane: Plane;
  id: string;
  ts: string;
  direction: "inbound" | "outbound";
  amountUsd: number;
  counterparty: string;
  /** Country (internal) or chain + risk label (on-chain). */
  detail: string;
  /** Part of an AML finding's evidence set — the rows to highlight. */
  evidence: boolean;
  highRisk: boolean;
}

export interface InvestigationFinding {
  id: string;
  flagType: AmlFlagType;
  label: string;
  severity: AmlSeverity;
  confidence: number;
  rationale: string;
  recommendedAction: string;
  narrative: string | null;
  status: AmlStatus;
  evidenceCount: number;
  metrics: Record<string, number | string>;
}

export interface InvestigationView {
  entityName: string;
  hasActivity: boolean;
  /** Top finding severity, or null if nothing fired. */
  severity: AmlSeverity | null;
  window: InvestigationWindow | null;
  findings: InvestigationFinding[];
  flows: FlowCluster[];
  /** Evidence transactions, expanded (the rows behind the findings). */
  evidence: TimelineEvent[];
  /** Merged internal + on-chain events within the window (capped). */
  timeline: TimelineEvent[];
  ledger: {
    internalCount: number;
    onchainCount: number;
    internalTotalUsd: number;
    onchainTotalUsd: number;
    windowInternalCount: number;
    windowOnchainCount: number;
  };
  addresses: { chain: string; address: string }[];
  /** Optional on-demand LLM summary; null until the narrate endpoint is called. */
  narrative: string | null;
  /** Confidence attached to the LLM summary, when one has been generated. */
  narrativeConfidence?: number;
}

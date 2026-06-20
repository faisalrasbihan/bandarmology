import { z } from "zod";
import type { TokenUsage } from "../classify/types";

/**
 * Layer 1 — PUBLIC exposure graph. A normalized, typed edge from a client to a
 * thing in the public world that can move its risk (its sector, jurisdiction,
 * named directors, key suppliers/customers, subsidiaries, regulators). Every
 * value here is a *public* fact (registry / news / onboarding questionnaire),
 * so this whole module lives in Layer 1.
 *
 * DATA-SEPARATION GUARDRAIL (CLAUDE.md): beneficial ownership / UBO is sensitive
 * Layer 2 KYC data and is deliberately NOT a tag type here — it stays in
 * `KycBaseline.ownershipStructure` (src/server/baseline/). The `layer` field is
 * fixed to "public" and enforced by a DB CHECK constraint, so an internal edge
 * physically cannot be written to this table.
 */

export const PUBLIC_TAG_TYPES = [
  "sector",
  "country",
  "director",
  "supplier",
  "customer",
  "subsidiary",
  "regulator",
] as const;

export type PublicTagType = (typeof PUBLIC_TAG_TYPES)[number];

/**
 * Tag types specific enough to drive *second-order propagation* (an alert on a
 * client because a public signal hit one of its exposures). Coarse `sector` /
 * `country` tags over-match at news volume (see ARCHITECTURE.md) — they're kept
 * for routing/recall, not propagation.
 */
export const PROPAGATABLE_TAG_TYPES: readonly PublicTagType[] = [
  "director",
  "supplier",
  "customer",
  "subsidiary",
  "regulator",
];

export interface ExposureEdge {
  id: string;
  entityName: string;
  tagType: PublicTagType;
  tagValue: string;
  /** Always "public" — Layer 1. (Layer 2 ownership stays in KycBaseline.) */
  layer: "public";
  /** Where this edge came from: "onboarding", "registry", "news", … */
  source: string;
  confidence: number;
  /** Layer 1 Signal.ids backing this edge, when it was derived from a signal. */
  citationSignalIds: string[];
  createdAt: string;
}

export type ExposureAlertStatus = "proposed" | "confirmed" | "escalated" | "dismissed";

/**
 * A second-order alert: raised on `entityName` not because it was named in the
 * news, but because a public signal materially impacts something it is exposed
 * to (`tagType`:`tagValue`). The citation chain is fully explainable:
 * Signal.id → exposure edge (tagValue, tagType) → entityName.
 */
export interface ExposureAlert {
  id: string;
  entityName: string;
  tagType: PublicTagType;
  tagValue: string;
  /** The public signal about the tagValue that triggered this. */
  signalId: string;
  confidence: number;
  rationale: string;
  recommendedAction: string;
  citationSignalIds: string[];
  status: ExposureAlertStatus;
  modelUsed: string;
  tokenUsage: TokenUsage;
  createdAt: string;
}

export interface ExposureAlertDecision {
  id: string;
  alertId: string;
  fromStatus: ExposureAlertStatus;
  toStatus: ExposureAlertStatus;
  actor: string;
  note: string | null;
  createdAt: string;
}

/**
 * LLM materiality judgement for one (signal × exposure edge) pair. Reject/retry
 * on violation — never relaxed to fit a bad response.
 */
export const ExposureImpactSchema = z.object({
  /** True only if the signal genuinely, materially affects the exposed client through this edge. */
  materiallyImpacts: z.boolean(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  recommendedAction: z.string().min(1),
  citationSignalIds: z.array(z.string()).min(1),
});

export type ExposureImpact = z.infer<typeof ExposureImpactSchema>;

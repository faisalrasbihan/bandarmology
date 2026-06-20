import { z } from "zod";
import { RISK_TAXONOMY } from "../filter/taxonomy";

const FLAG_TYPE_IDS = RISK_TAXONOMY.map((c) => c.id) as [string, ...string[]];

/** Stage 2 LLM output schema. Reject/retry on violation — never relax this to fit a bad response. */
export const Stage2OutputSchema = z.object({
  /**
   * False-positive guard: is the signal actually about the named entity as a
   * risk subject (not a same-name different company, a person, or a passing
   * mention)? If false, runStage2 suppresses the alert.
   */
  concernsEntity: z.boolean(),
  flagType: z.enum(FLAG_TYPE_IDS),
  confidence: z.number().min(0).max(1),
  citationSignalIds: z.array(z.string()).min(1),
  rationale: z.string().min(1),
  recommendedAction: z.string().min(1),
});

export type Stage2Output = z.infer<typeof Stage2OutputSchema>;

export const DRIFT_TYPES = [
  "business_model_change",
  "jurisdiction_change",
  "ownership_change",
  "activity_volume_change",
  "risk_rating_change",
  "none",
] as const;

export const DRIFT_SEVERITIES = ["low", "medium", "high", "critical"] as const;

/**
 * Stage 3 deep-analysis output: a structured diff of the Layer 1 signal against
 * the Layer 2 KYC baseline. Same enforce-don't-trust contract as Stage 2 —
 * validated with this schema, citations checked against the real signal id.
 */
export const Stage3OutputSchema = z.object({
  driftDetected: z.boolean(),
  driftType: z.enum(DRIFT_TYPES),
  severity: z.enum(DRIFT_SEVERITIES),
  confidence: z.number().min(0).max(1),
  comparison: z
    .array(
      z.object({
        dimension: z.string().min(1),
        expected: z.string(),
        observed: z.string(),
        changed: z.boolean(),
      })
    )
    .min(1),
  narrative: z.string().min(1),
  recommendedAction: z.string().min(1),
  citationSignalIds: z.array(z.string()).min(1),
});

export type Stage3Output = z.infer<typeof Stage3OutputSchema>;

export interface DriftFinding extends Stage3Output {
  id: string;
  alertId: string;
  entityHint: string;
  modelUsed: string;
  tokenUsage: TokenUsage;
  createdAt: string;
}

export type AlertStatus = "proposed" | "confirmed" | "escalated" | "dismissed";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface Alert {
  id: string;
  signalId: string;
  entityHint: string;
  flagType: string;
  confidence: number;
  citations: string[];
  rationale: string;
  recommendedAction: string;
  status: AlertStatus;
  modelUsed: string;
  tokenUsage: TokenUsage;
  createdAt: string;
}

export interface LlmCallLog {
  id: string;
  stage: "stage2" | "stage3";
  model: string;
  signalId: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  success: boolean;
  error: string | null;
  createdAt: string;
}

/** Append-only audit record of a human moving an alert between statuses. */
export interface AlertDecision {
  id: string;
  alertId: string;
  fromStatus: AlertStatus;
  toStatus: AlertStatus;
  actor: string;
  note: string | null;
  createdAt: string;
}

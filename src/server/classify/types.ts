import { z } from "zod";
import { RISK_TAXONOMY } from "../filter/taxonomy";

const FLAG_TYPE_IDS = RISK_TAXONOMY.map((c) => c.id) as [string, ...string[]];

/** Stage 2 LLM output schema. Reject/retry on violation — never relax this to fit a bad response. */
export const Stage2OutputSchema = z.object({
  flagType: z.enum(FLAG_TYPE_IDS),
  confidence: z.number().min(0).max(1),
  citationSignalIds: z.array(z.string()).min(1),
  rationale: z.string().min(1),
  recommendedAction: z.string().min(1),
});

export type Stage2Output = z.infer<typeof Stage2OutputSchema>;

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

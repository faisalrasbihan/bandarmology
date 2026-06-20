import type { Signal } from "../signals/types";
import { classifySignal, type Stage1Classification } from "./stage1";
import { getStage1Classifications, recordStage1Classification } from "./store";

export interface ClassifiedSignal extends Signal {
  stage1: Stage1Classification;
}

/**
 * Runs Stage 1 (cheap filter) over a batch of signals and persists each
 * result. No LLM calls — safe to run on every newly ingested signal.
 */
export async function runStage1(signals: Signal[]): Promise<ClassifiedSignal[]> {
  const classified: ClassifiedSignal[] = [];
  for (const signal of signals) {
    const stage1 = classifySignal(signal);
    await recordStage1Classification(signal.id, stage1);
    classified.push({ ...signal, stage1 });
  }
  return classified;
}

/** Attaches previously-computed Stage 1 results to already-stored signals. */
export async function attachStage1Classifications(signals: Signal[]): Promise<ClassifiedSignal[]> {
  const classifications = await getStage1Classifications(signals.map((s) => s.id));
  return signals.map((signal) => ({
    ...signal,
    stage1: classifications.get(signal.id) ?? { passed: false, topMatch: null, matches: [], classifiedAt: "" },
  }));
}

export { classifySignal } from "./stage1";
export { getTriageStats } from "./store";
export { RISK_TAXONOMY } from "./taxonomy";
export type { RiskCategory } from "./taxonomy";
export type { RiskMatch, Stage1Classification } from "./stage1";

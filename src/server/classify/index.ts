import { attachStage1Classifications, type ClassifiedSignal } from "../filter";
import { getStoredSignals } from "../signals";
import { classifySignalWithLlm } from "./stage2";
import { createAlert, getSignalIdsWithAlerts, logLlmCall } from "./store";
import type { Alert } from "./types";

const STAGE2_MODEL = "claude-haiku-4-5";

/**
 * Runs Stage 2 over signals that survived Stage 1 and don't already have an
 * alert. Each LLM call is logged regardless of outcome (success or schema
 * failure) — this is the only place that calls an LLM in the codebase today,
 * and every call path through it goes through logLlmCall so the
 * cost-per-1000-alerts metric stays accurate.
 */
export async function runStage2(filter?: { entityHint?: string; limit?: number }): Promise<{
  alerts: Alert[];
  skippedNoFlag: number;
  errors: { signalId: string; error: string }[];
}> {
  const stored = await getStoredSignals(filter?.entityHint ? { entityHint: filter.entityHint } : undefined);
  const classified = await attachStage1Classifications(stored);
  const survivors = classified.filter((s) => s.stage1.passed);

  const alreadyAlerted = await getSignalIdsWithAlerts(survivors.map((s) => s.id));
  const candidates = survivors.filter((s) => !alreadyAlerted.has(s.id)).slice(0, filter?.limit ?? 10);

  const alerts: Alert[] = [];
  const errors: { signalId: string; error: string }[] = [];
  let skippedNoFlag = 0;

  for (const signal of candidates) {
    const result = await classifySignalWithLlm(signal as ClassifiedSignal);

    await logLlmCall({
      stage: "stage2",
      model: STAGE2_MODEL,
      signalId: signal.id,
      tokenUsage: result.tokenUsage,
      success: result.output !== null,
      error: result.error,
    });

    if (!result.output) {
      skippedNoFlag++;
      errors.push({ signalId: signal.id, error: result.error ?? "unknown validation failure" });
      continue;
    }

    const alert = await createAlert({
      signal: { id: signal.id, entityHint: signal.entityHint },
      output: result.output,
      model: STAGE2_MODEL,
      tokenUsage: result.tokenUsage,
    });
    alerts.push(alert);
  }

  return { alerts, skippedNoFlag, errors };
}

export { getAlerts, setAlertStatus, getCostSummary } from "./store";
export type { Alert, AlertStatus, TokenUsage, Stage2Output } from "./types";

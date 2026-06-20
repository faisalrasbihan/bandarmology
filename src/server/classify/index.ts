import { getBaselineByCompany } from "../baseline";
import { attachStage1Classifications, type ClassifiedSignal } from "../filter";
import { getSignalsByIds, getStoredSignals } from "../signals";
import { classifySignalWithLlm, STAGE2_MODEL } from "./stage2";
import { analyzeDrift, STAGE3_MODEL } from "./stage3";
import {
  createAlert,
  createDriftFinding,
  getAlertById,
  getSignalIdsWithAlerts,
  logLlmCall,
} from "./store";
import type { Alert, DriftFinding } from "./types";

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
  skippedWrongEntity: number;
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
  let skippedWrongEntity = 0;

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

    // False-positive guard: the LLM judged this signal isn't actually about the
    // searched entity (same-name company, person, passing mention). Don't raise
    // an alert for the wrong entity. The call is still logged above for cost.
    if (!result.output.concernsEntity) {
      skippedWrongEntity++;
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

  return { alerts, skippedNoFlag, skippedWrongEntity, errors };
}

/**
 * Stage 3 deep analysis for one alert — the explicit, auditable Layer 1 × Layer 2
 * join. Fetches the alert and its signal (Layer 1) and the entity's KYC baseline
 * (Layer 2), runs the drift analysis, logs the LLM call, and persists the
 * finding. Returns `{ finding: null, reason }` if there's no baseline to compare
 * against or the analysis fails — never fabricates a drift result.
 */
export async function runStage3(alertId: string): Promise<{
  finding: DriftFinding | null;
  reason: string | null;
}> {
  const alert = await getAlertById(alertId);
  if (!alert) return { finding: null, reason: "alert not found" };

  const baseline = await getBaselineByCompany(alert.entityHint);
  if (!baseline) {
    return { finding: null, reason: `no KYC baseline on file for "${alert.entityHint}"` };
  }

  const [signal] = await getSignalsByIds([alert.signalId]);
  if (!signal) return { finding: null, reason: "underlying signal not found" };

  const result = await analyzeDrift(alert, signal, baseline);

  await logLlmCall({
    stage: "stage3",
    model: STAGE3_MODEL,
    signalId: signal.id,
    tokenUsage: result.tokenUsage,
    success: result.output !== null,
    error: result.error,
  });

  if (!result.output) {
    return { finding: null, reason: result.error ?? "drift analysis failed validation" };
  }

  const finding = await createDriftFinding({
    alertId: alert.id,
    entityHint: alert.entityHint,
    output: result.output,
    model: STAGE3_MODEL,
    tokenUsage: result.tokenUsage,
  });
  return { finding, reason: null };
}

export { submitStage2Batch, collectStage2Batch } from "./batch";
export {
  getAlerts,
  getAlertById,
  setAlertStatus,
  getAlertDecisions,
  getDriftFindings,
  getCostSummary,
} from "./store";
export type { Alert, AlertStatus, AlertDecision, DriftFinding, TokenUsage, Stage2Output, Stage3Output } from "./types";

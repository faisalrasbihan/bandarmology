import { getAnthropic, tokenUsageFor } from "../anthropic";
import { attachStage1Classifications, type ClassifiedSignal } from "../filter";
import { getStoredSignals } from "../signals";
import { buildStage2Request, extractToolInput, STAGE2_MODEL, validateStage2 } from "./stage2";
import { createAlert, getSignalIdsWithAlerts, logLlmCall } from "./store";

/**
 * Opt-in Message Batches path for Stage 2. The Batches API processes requests
 * asynchronously at 50% of standard pricing — a good fit for /api/alerts/generate
 * because it's an explicit, non-interactive bulk operation. The trade-off is
 * latency (minutes, up to 24h), so the synchronous path stays the default for
 * the demo; this is for cost-sensitive bulk backfills.
 *
 * custom_id is the signal id, so when results come back we can re-fetch the
 * signal and apply the same grounding/entity guard as the sync path. Single
 * attempt (no in-batch retry): a validation failure is logged and skipped.
 */

export async function submitStage2Batch(filter?: { entityHint?: string; limit?: number }): Promise<{
  batchId: string | null;
  submitted: number;
}> {
  const stored = await getStoredSignals(filter?.entityHint ? { entityHint: filter.entityHint } : undefined);
  const classified = await attachStage1Classifications(stored);
  const survivors = classified.filter((s) => s.stage1.passed);
  const alreadyAlerted = await getSignalIdsWithAlerts(survivors.map((s) => s.id));
  const candidates = survivors.filter((s) => !alreadyAlerted.has(s.id)).slice(0, filter?.limit ?? 100);

  if (candidates.length === 0) return { batchId: null, submitted: 0 };

  const batch = await getAnthropic().messages.batches.create({
    requests: candidates.map((signal) => ({
      custom_id: signal.id,
      params: buildStage2Request(signal as ClassifiedSignal),
    })),
  });
  return { batchId: batch.id, submitted: candidates.length };
}

export async function collectStage2Batch(batchId: string): Promise<{
  status: string;
  created: number;
  skippedNoFlag: number;
  skippedWrongEntity: number;
  errors: { signalId: string; error: string }[];
}> {
  const client = getAnthropic();
  const batch = await client.messages.batches.retrieve(batchId);
  if (batch.processing_status !== "ended") {
    return { status: batch.processing_status, created: 0, skippedNoFlag: 0, skippedWrongEntity: 0, errors: [] };
  }

  // Map signal id -> entityHint for the alerts we'll create. Results carry only
  // custom_id (= signal id), so re-fetch the signals to recover entityHint.
  const stored = await getStoredSignals();
  const entityById = new Map(stored.map((s) => [s.id, s.entityHint]));
  const alreadyAlerted = await getSignalIdsWithAlerts([...entityById.keys()]);

  let created = 0;
  let skippedNoFlag = 0;
  let skippedWrongEntity = 0;
  const errors: { signalId: string; error: string }[] = [];

  for await (const result of await client.messages.batches.results(batchId)) {
    const signalId = result.custom_id;
    if (alreadyAlerted.has(signalId)) continue; // created since submission — don't double-insert

    if (result.result.type !== "succeeded") {
      skippedNoFlag++;
      errors.push({ signalId, error: `batch result ${result.result.type}` });
      continue;
    }

    const message = result.result.message;
    const usage = tokenUsageFor(STAGE2_MODEL, message.usage);
    const validated = validateStage2(extractToolInput(message), new Set([signalId]));

    await logLlmCall({
      stage: "stage2",
      model: STAGE2_MODEL,
      signalId,
      tokenUsage: usage,
      success: "output" in validated,
      error: "error" in validated ? validated.error : null,
    });

    if ("error" in validated) {
      skippedNoFlag++;
      errors.push({ signalId, error: validated.error });
      continue;
    }
    if (!validated.output.concernsEntity) {
      skippedWrongEntity++;
      continue;
    }

    await createAlert({
      signal: { id: signalId, entityHint: entityById.get(signalId) ?? signalId },
      output: validated.output,
      model: STAGE2_MODEL,
      tokenUsage: usage,
    });
    created++;
  }

  return { status: "ended", created, skippedNoFlag, skippedWrongEntity, errors };
}

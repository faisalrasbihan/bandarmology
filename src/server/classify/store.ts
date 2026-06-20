import { randomUUID } from "crypto";
import { defineSchema, getPool } from "../db";
import type {
  Alert,
  AlertDecision,
  AlertStatus,
  DriftFinding,
  LlmCallLog,
  LlmStage,
  Stage2Output,
  Stage3Output,
  TokenUsage,
} from "./types";

const ensureSchema = defineSchema(`
  CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY,
    signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    entity_hint TEXT NOT NULL,
    flag_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    citations TEXT[] NOT NULL,
    rationale TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    model_used TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS alerts_signal_id_idx ON alerts (signal_id);
  CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts (status);
  CREATE INDEX IF NOT EXISTS alerts_entity_hint_idx ON alerts (lower(entity_hint));

  CREATE TABLE IF NOT EXISTS llm_calls (
    id UUID PRIMARY KEY,
    stage TEXT NOT NULL,
    model TEXT NOT NULL,
    signal_id UUID REFERENCES signals(id) ON DELETE SET NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    success BOOLEAN NOT NULL,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS llm_calls_stage_idx ON llm_calls (stage);

  CREATE TABLE IF NOT EXISTS alert_decisions (
    id UUID PRIMARY KEY,
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    actor TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS alert_decisions_alert_id_idx ON alert_decisions (alert_id);

  CREATE TABLE IF NOT EXISTS drift_findings (
    id UUID PRIMARY KEY,
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    entity_hint TEXT NOT NULL,
    drift_detected BOOLEAN NOT NULL,
    drift_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence REAL NOT NULL,
    comparison JSONB NOT NULL,
    narrative TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    citations TEXT[] NOT NULL,
    model_used TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS drift_findings_alert_id_idx ON drift_findings (alert_id);
`);

/** Every LLM call is logged here regardless of outcome — this feeds the cost-per-1000-alerts metric. */
export async function logLlmCall(params: {
  stage: LlmStage;
  model: string;
  signalId: string | null;
  tokenUsage: TokenUsage;
  success: boolean;
  error: string | null;
}): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO llm_calls (id, stage, model, signal_id, input_tokens, output_tokens, cost_usd, success, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      randomUUID(),
      params.stage,
      params.model,
      params.signalId,
      params.tokenUsage.inputTokens,
      params.tokenUsage.outputTokens,
      params.tokenUsage.costUsd,
      params.success,
      params.error,
    ]
  );
}

/** Alerts always start as 'proposed' — no code path sets any other status on creation. */
export async function createAlert(params: {
  signal: { id: string; entityHint: string };
  output: Stage2Output;
  model: string;
  tokenUsage: TokenUsage;
}): Promise<Alert> {
  await ensureSchema();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await getPool().query(
    `INSERT INTO alerts
       (id, signal_id, entity_hint, flag_type, confidence, citations, rationale,
        recommended_action, status, model_used, input_tokens, output_tokens, cost_usd, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'proposed', $9, $10, $11, $12, $13)
     ON CONFLICT (signal_id) DO NOTHING`,
    [
      id,
      params.signal.id,
      params.signal.entityHint,
      params.output.flagType,
      params.output.confidence,
      params.output.citationSignalIds,
      params.output.rationale,
      params.output.recommendedAction,
      params.model,
      params.tokenUsage.inputTokens,
      params.tokenUsage.outputTokens,
      params.tokenUsage.costUsd,
      createdAt,
    ]
  );
  return {
    id,
    signalId: params.signal.id,
    entityHint: params.signal.entityHint,
    flagType: params.output.flagType,
    confidence: params.output.confidence,
    citations: params.output.citationSignalIds,
    rationale: params.output.rationale,
    recommendedAction: params.output.recommendedAction,
    status: "proposed",
    modelUsed: params.model,
    tokenUsage: params.tokenUsage,
    createdAt,
  };
}

interface AlertRow {
  id: string;
  signal_id: string;
  entity_hint: string;
  flag_type: string;
  confidence: number;
  citations: string[];
  rationale: string;
  recommended_action: string;
  status: AlertStatus;
  model_used: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

function rowToAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    signalId: row.signal_id,
    entityHint: row.entity_hint,
    flagType: row.flag_type,
    confidence: row.confidence,
    citations: row.citations,
    rationale: row.rationale,
    recommendedAction: row.recommended_action,
    status: row.status,
    modelUsed: row.model_used,
    tokenUsage: { inputTokens: row.input_tokens, outputTokens: row.output_tokens, costUsd: row.cost_usd },
    createdAt: row.created_at,
  };
}

export async function getAlerts(filter?: { entityHint?: string; status?: AlertStatus }): Promise<Alert[]> {
  await ensureSchema();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter?.entityHint) {
    params.push(filter.entityHint);
    conditions.push(`lower(entity_hint) = lower($${params.length})`);
  }
  if (filter?.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await getPool().query<AlertRow>(`SELECT * FROM alerts ${where} ORDER BY created_at DESC`, params);
  return rows.map(rowToAlert);
}

export async function getAlertById(id: string): Promise<Alert | null> {
  await ensureSchema();
  const { rows } = await getPool().query<AlertRow>(`SELECT * FROM alerts WHERE id = $1`, [id]);
  return rows.length ? rowToAlert(rows[0]) : null;
}

/**
 * Human-in-the-loop guardrail: the only function allowed to change an alert's
 * status. Records an append-only audit row (who, from→to, when, optional note)
 * in the same transaction as the status update — so the alert's current status
 * and the decision trail can never disagree. Returns false if the alert is
 * gone or its status is unchanged (no audit row written in that case).
 */
export async function setAlertStatus(
  id: string,
  status: AlertStatus,
  actor: string,
  note?: string
): Promise<boolean> {
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ status: AlertStatus }>(
      `SELECT status FROM alerts WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0 || rows[0].status === status) {
      await client.query("ROLLBACK");
      return false;
    }
    const fromStatus = rows[0].status;
    await client.query(`UPDATE alerts SET status = $1 WHERE id = $2`, [status, id]);
    await client.query(
      `INSERT INTO alert_decisions (id, alert_id, from_status, to_status, actor, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), id, fromStatus, status, actor, note ?? null]
    );
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

interface DecisionRow {
  id: string;
  alert_id: string;
  from_status: AlertStatus;
  to_status: AlertStatus;
  actor: string;
  note: string | null;
  created_at: string;
}

export async function getAlertDecisions(alertId: string): Promise<AlertDecision[]> {
  await ensureSchema();
  const { rows } = await getPool().query<DecisionRow>(
    `SELECT * FROM alert_decisions WHERE alert_id = $1 ORDER BY created_at ASC`,
    [alertId]
  );
  return rows.map((r) => ({
    id: r.id,
    alertId: r.alert_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    actor: r.actor,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export async function createDriftFinding(params: {
  alertId: string;
  entityHint: string;
  output: Stage3Output;
  model: string;
  tokenUsage: TokenUsage;
}): Promise<DriftFinding> {
  await ensureSchema();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await getPool().query(
    `INSERT INTO drift_findings
       (id, alert_id, entity_hint, drift_detected, drift_type, severity, confidence,
        comparison, narrative, recommended_action, citations, model_used,
        input_tokens, output_tokens, cost_usd, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      params.alertId,
      params.entityHint,
      params.output.driftDetected,
      params.output.driftType,
      params.output.severity,
      params.output.confidence,
      JSON.stringify(params.output.comparison),
      params.output.narrative,
      params.output.recommendedAction,
      params.output.citationSignalIds,
      params.model,
      params.tokenUsage.inputTokens,
      params.tokenUsage.outputTokens,
      params.tokenUsage.costUsd,
      createdAt,
    ]
  );
  return {
    id,
    alertId: params.alertId,
    entityHint: params.entityHint,
    ...params.output,
    modelUsed: params.model,
    tokenUsage: params.tokenUsage,
    createdAt,
  };
}

interface DriftRow {
  id: string;
  alert_id: string;
  entity_hint: string;
  drift_detected: boolean;
  drift_type: Stage3Output["driftType"];
  severity: Stage3Output["severity"];
  confidence: number;
  comparison: Stage3Output["comparison"];
  narrative: string;
  recommended_action: string;
  citations: string[];
  model_used: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

function rowToDrift(row: DriftRow): DriftFinding {
  return {
    id: row.id,
    alertId: row.alert_id,
    entityHint: row.entity_hint,
    driftDetected: row.drift_detected,
    driftType: row.drift_type,
    severity: row.severity,
    confidence: row.confidence,
    comparison: row.comparison,
    narrative: row.narrative,
    recommendedAction: row.recommended_action,
    citationSignalIds: row.citations,
    modelUsed: row.model_used,
    tokenUsage: { inputTokens: row.input_tokens, outputTokens: row.output_tokens, costUsd: row.cost_usd },
    createdAt: row.created_at,
  };
}

export async function getDriftFindings(alertId: string): Promise<DriftFinding[]> {
  await ensureSchema();
  const { rows } = await getPool().query<DriftRow>(
    `SELECT * FROM drift_findings WHERE alert_id = $1 ORDER BY created_at DESC`,
    [alertId]
  );
  return rows.map(rowToDrift);
}

export async function getSignalIdsWithAlerts(signalIds: string[]): Promise<Set<string>> {
  await ensureSchema();
  if (signalIds.length === 0) return new Set();
  const { rows } = await getPool().query<{ signal_id: string }>(
    `SELECT signal_id FROM alerts WHERE signal_id = ANY($1)`,
    [signalIds]
  );
  return new Set(rows.map((r) => r.signal_id));
}

export interface CostSummary {
  totalAlerts: number;
  totalLlmCalls: number;
  totalCostUsd: number;
  costPer1000Alerts: number | null;
  /** Stage-1 triage volume — the "% resolved without an LLM" cost-efficiency story. */
  signalsTriaged: number;
  resolvedWithoutLlm: number;
  passedToLlm: number;
  pctResolvedWithoutLlm: number | null;
}

export async function getCostSummary(triage: {
  triaged: number;
  passed: number;
  filtered: number;
}): Promise<CostSummary> {
  await ensureSchema();
  const pool = getPool();
  const [{ rows: alertRows }, { rows: callRows }] = await Promise.all([
    pool.query<{ count: string }>(`SELECT count(*) FROM alerts`),
    pool.query<{ count: string; total_cost: string | null }>(
      `SELECT count(*), sum(cost_usd) AS total_cost FROM llm_calls`
    ),
  ]);
  const totalAlerts = Number(alertRows[0].count);
  const totalLlmCalls = Number(callRows[0].count);
  const totalCostUsd = Number(callRows[0].total_cost ?? 0);
  return {
    totalAlerts,
    totalLlmCalls,
    totalCostUsd,
    costPer1000Alerts: totalAlerts > 0 ? (totalCostUsd / totalAlerts) * 1000 : null,
    signalsTriaged: triage.triaged,
    resolvedWithoutLlm: triage.filtered,
    passedToLlm: triage.passed,
    pctResolvedWithoutLlm: triage.triaged > 0 ? (triage.filtered / triage.triaged) * 100 : null,
  };
}

export type { Alert, AlertStatus, AlertDecision, DriftFinding, LlmCallLog };

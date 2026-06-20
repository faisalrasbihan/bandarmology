import { randomUUID } from "crypto";
import { getPool } from "../db";
import type { Alert, AlertStatus, LlmCallLog, Stage2Output, TokenUsage } from "./types";

let schemaReady: Promise<void> | null = null;

const SCHEMA_DDL = `
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
`;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA_DDL)
      .then(() => undefined)
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

/** Every LLM call is logged here regardless of outcome — this feeds the cost-per-1000-alerts metric. */
export async function logLlmCall(params: {
  stage: "stage2" | "stage3";
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

/** Human-in-the-loop guardrail: this is the only function allowed to change an alert's status. */
export async function setAlertStatus(id: string, status: AlertStatus): Promise<void> {
  await ensureSchema();
  await getPool().query(`UPDATE alerts SET status = $1 WHERE id = $2`, [status, id]);
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

export async function getCostSummary(): Promise<{
  totalAlerts: number;
  totalLlmCalls: number;
  totalCostUsd: number;
  costPer1000Alerts: number | null;
}> {
  await ensureSchema();
  const pool = getPool();
  const [{ rows: alertRows }, { rows: callRows }] = await Promise.all([
    pool.query<{ count: string }>(`SELECT count(*) FROM alerts`),
    pool.query<{ count: string; total_cost: string | null }>(`SELECT count(*), sum(cost_usd) AS total_cost FROM llm_calls`),
  ]);
  const totalAlerts = Number(alertRows[0].count);
  const totalLlmCalls = Number(callRows[0].count);
  const totalCostUsd = Number(callRows[0].total_cost ?? 0);
  return {
    totalAlerts,
    totalLlmCalls,
    totalCostUsd,
    costPer1000Alerts: totalAlerts > 0 ? (totalCostUsd / totalAlerts) * 1000 : null,
  };
}

export type { Alert, AlertStatus, LlmCallLog };

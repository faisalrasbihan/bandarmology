import { randomUUID } from "crypto";
import { defineSchema, getPool } from "../db";
import type { TokenUsage } from "../classify/types";
import type {
  ExposureAlert,
  ExposureAlertDecision,
  ExposureAlertStatus,
  ExposureEdge,
  ExposureImpact,
  PublicTagType,
} from "./types";

/**
 * Layer 1 store for the public exposure graph + the second-order exposure alerts
 * it produces. `entity_exposures.layer` carries a CHECK (layer = 'public')
 * constraint: the data-separation guardrail is enforced by the database, not
 * just by convention — no internal/Layer-2 edge can be inserted here.
 */
const ensureSchema = defineSchema(`
  CREATE TABLE IF NOT EXISTS entity_exposures (
    id UUID PRIMARY KEY,
    entity_name TEXT NOT NULL,
    tag_type TEXT NOT NULL,
    tag_value TEXT NOT NULL,
    layer TEXT NOT NULL DEFAULT 'public' CHECK (layer = 'public'),
    source TEXT NOT NULL,
    confidence REAL NOT NULL,
    citation_signal_ids TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS entity_exposures_uniq
    ON entity_exposures (lower(entity_name), tag_type, lower(tag_value));
  CREATE INDEX IF NOT EXISTS entity_exposures_tagval_idx
    ON entity_exposures (tag_type, lower(tag_value));

  CREATE TABLE IF NOT EXISTS exposure_alerts (
    id UUID PRIMARY KEY,
    entity_name TEXT NOT NULL,
    tag_type TEXT NOT NULL,
    tag_value TEXT NOT NULL,
    signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    confidence REAL NOT NULL,
    rationale TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    citation_signal_ids TEXT[] NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    model_used TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS exposure_alerts_uniq
    ON exposure_alerts (lower(entity_name), signal_id, lower(tag_value));
  CREATE INDEX IF NOT EXISTS exposure_alerts_entity_idx ON exposure_alerts (lower(entity_name));
  CREATE INDEX IF NOT EXISTS exposure_alerts_status_idx ON exposure_alerts (status);

  CREATE TABLE IF NOT EXISTS exposure_alert_decisions (
    id UUID PRIMARY KEY,
    alert_id UUID NOT NULL REFERENCES exposure_alerts(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    actor TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS exposure_alert_decisions_alert_idx ON exposure_alert_decisions (alert_id);
`);

// ---- Exposure edges ----------------------------------------------------------

interface EdgeRow {
  id: string;
  entity_name: string;
  tag_type: PublicTagType;
  tag_value: string;
  source: string;
  confidence: number;
  citation_signal_ids: string[];
  created_at: string | Date;
}

function rowToEdge(r: EdgeRow): ExposureEdge {
  return {
    id: r.id,
    entityName: r.entity_name,
    tagType: r.tag_type,
    tagValue: r.tag_value,
    layer: "public",
    source: r.source,
    confidence: r.confidence,
    citationSignalIds: r.citation_signal_ids,
    createdAt: r.created_at instanceof Date ? (r.created_at as Date).toISOString() : String(r.created_at),
  };
}

export interface ExposureEdgeInput {
  entityName: string;
  tagType: PublicTagType;
  tagValue: string;
  source: string;
  confidence: number;
  citationSignalIds?: string[];
}

/** Upsert one public exposure edge (idempotent per entity + tagType + tagValue). */
export async function upsertExposureEdge(e: ExposureEdgeInput): Promise<ExposureEdge> {
  await ensureSchema();
  const id = randomUUID();
  const { rows } = await getPool().query<EdgeRow>(
    `INSERT INTO entity_exposures
       (id, entity_name, tag_type, tag_value, layer, source, confidence, citation_signal_ids)
     VALUES ($1, $2, $3, $4, 'public', $5, $6, $7)
     ON CONFLICT (lower(entity_name), tag_type, lower(tag_value)) DO UPDATE SET
       source = EXCLUDED.source,
       confidence = EXCLUDED.confidence,
       citation_signal_ids = EXCLUDED.citation_signal_ids
     RETURNING *`,
    [id, e.entityName, e.tagType, e.tagValue, e.source, e.confidence, e.citationSignalIds ?? []]
  );
  return rowToEdge(rows[0]);
}

export async function upsertExposureEdges(edges: ExposureEdgeInput[]): Promise<ExposureEdge[]> {
  const out: ExposureEdge[] = [];
  for (const e of edges) out.push(await upsertExposureEdge(e));
  return out;
}

export async function getExposureEdges(filter?: {
  entityName?: string;
  tagType?: PublicTagType;
}): Promise<ExposureEdge[]> {
  await ensureSchema();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter?.entityName) {
    params.push(filter.entityName);
    conditions.push(`lower(entity_name) = lower($${params.length})`);
  }
  if (filter?.tagType) {
    params.push(filter.tagType);
    conditions.push(`tag_type = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await getPool().query<EdgeRow>(
    `SELECT * FROM entity_exposures ${where} ORDER BY entity_name, tag_type, tag_value`,
    params
  );
  return rows.map(rowToEdge);
}

// ---- Exposure alerts ---------------------------------------------------------

interface AlertRow {
  id: string;
  entity_name: string;
  tag_type: PublicTagType;
  tag_value: string;
  signal_id: string;
  confidence: number;
  rationale: string;
  recommended_action: string;
  citation_signal_ids: string[];
  status: ExposureAlertStatus;
  model_used: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string | Date;
}

function rowToAlert(r: AlertRow): ExposureAlert {
  return {
    id: r.id,
    entityName: r.entity_name,
    tagType: r.tag_type,
    tagValue: r.tag_value,
    signalId: r.signal_id,
    confidence: r.confidence,
    rationale: r.rationale,
    recommendedAction: r.recommended_action,
    citationSignalIds: r.citation_signal_ids,
    status: r.status,
    modelUsed: r.model_used,
    tokenUsage: { inputTokens: r.input_tokens, outputTokens: r.output_tokens, costUsd: r.cost_usd },
    createdAt: r.created_at instanceof Date ? (r.created_at as Date).toISOString() : String(r.created_at),
  };
}

/**
 * Creates an exposure alert — always `status: 'proposed'`, mirroring the
 * news-side `createAlert`. No code path here can set any other status; only the
 * human-initiated `setExposureAlertStatus` can. Idempotent per
 * (entity, signal, tagValue) so re-running propagation never duplicates.
 */
export async function createExposureAlert(params: {
  entityName: string;
  tagType: PublicTagType;
  tagValue: string;
  signalId: string;
  impact: ExposureImpact;
  model: string;
  tokenUsage: TokenUsage;
}): Promise<ExposureAlert> {
  await ensureSchema();
  const id = randomUUID();
  const { rows } = await getPool().query<AlertRow>(
    `INSERT INTO exposure_alerts
       (id, entity_name, tag_type, tag_value, signal_id, confidence, rationale,
        recommended_action, citation_signal_ids, status, model_used, input_tokens, output_tokens, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'proposed', $10, $11, $12, $13)
     ON CONFLICT (lower(entity_name), signal_id, lower(tag_value)) DO UPDATE SET
       confidence = EXCLUDED.confidence,
       rationale = EXCLUDED.rationale,
       recommended_action = EXCLUDED.recommended_action,
       citation_signal_ids = EXCLUDED.citation_signal_ids,
       model_used = EXCLUDED.model_used,
       input_tokens = EXCLUDED.input_tokens,
       output_tokens = EXCLUDED.output_tokens,
       cost_usd = EXCLUDED.cost_usd
     RETURNING *`,
    [
      id,
      params.entityName,
      params.tagType,
      params.tagValue,
      params.signalId,
      params.impact.confidence,
      params.impact.rationale,
      params.impact.recommendedAction,
      params.impact.citationSignalIds,
      params.model,
      params.tokenUsage.inputTokens,
      params.tokenUsage.outputTokens,
      params.tokenUsage.costUsd,
    ]
  );
  return rowToAlert(rows[0]);
}

export async function getExposureAlerts(filter?: {
  entityName?: string;
  status?: ExposureAlertStatus;
}): Promise<ExposureAlert[]> {
  await ensureSchema();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter?.entityName) {
    params.push(filter.entityName);
    conditions.push(`lower(entity_name) = lower($${params.length})`);
  }
  if (filter?.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await getPool().query<AlertRow>(
    `SELECT * FROM exposure_alerts ${where} ORDER BY confidence DESC, created_at DESC`,
    params
  );
  return rows.map(rowToAlert);
}

export async function getExposureAlertById(id: string): Promise<ExposureAlert | null> {
  await ensureSchema();
  const { rows } = await getPool().query<AlertRow>(`SELECT * FROM exposure_alerts WHERE id = $1`, [id]);
  return rows.length ? rowToAlert(rows[0]) : null;
}

/**
 * Human-in-the-loop guardrail — the only path that can move an exposure alert
 * out of 'proposed', writing an append-only audit row in the same transaction
 * (mirrors `setAlertStatus` / `setFindingStatus`).
 */
export async function setExposureAlertStatus(
  id: string,
  status: ExposureAlertStatus,
  actor: string,
  note?: string
): Promise<boolean> {
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ status: ExposureAlertStatus }>(
      `SELECT status FROM exposure_alerts WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0 || rows[0].status === status) {
      await client.query("ROLLBACK");
      return false;
    }
    const fromStatus = rows[0].status;
    await client.query(`UPDATE exposure_alerts SET status = $1 WHERE id = $2`, [status, id]);
    await client.query(
      `INSERT INTO exposure_alert_decisions (id, alert_id, from_status, to_status, actor, note)
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
  from_status: ExposureAlertStatus;
  to_status: ExposureAlertStatus;
  actor: string;
  note: string | null;
  created_at: string | Date;
}

export async function getExposureAlertDecisions(alertId: string): Promise<ExposureAlertDecision[]> {
  await ensureSchema();
  const { rows } = await getPool().query<DecisionRow>(
    `SELECT * FROM exposure_alert_decisions WHERE alert_id = $1 ORDER BY created_at ASC`,
    [alertId]
  );
  return rows.map((r) => ({
    id: r.id,
    alertId: r.alert_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    actor: r.actor,
    note: r.note,
    createdAt: r.created_at instanceof Date ? (r.created_at as Date).toISOString() : String(r.created_at),
  }));
}

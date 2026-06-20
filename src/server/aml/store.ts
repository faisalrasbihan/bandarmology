import { randomUUID } from "crypto";
import { defineSchema, getPool } from "../db";
import type {
  AmlFinding,
  AmlFindingDecision,
  AmlFlagType,
  AmlSeverity,
  AmlStatus,
  Transaction,
} from "./types";

const ensureSchema = defineSchema(`
  CREATE TABLE IF NOT EXISTS aml_transactions (
    id UUID PRIMARY KEY,
    entity_name TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    amount_usd NUMERIC NOT NULL,
    direction TEXT NOT NULL,
    counterparty TEXT NOT NULL,
    counterparty_country TEXT NOT NULL,
    cross_border BOOLEAN NOT NULL,
    channel TEXT NOT NULL,
    synthetic BOOLEAN NOT NULL DEFAULT true
  );
  CREATE INDEX IF NOT EXISTS aml_tx_entity_idx ON aml_transactions (lower(entity_name));
  CREATE INDEX IF NOT EXISTS aml_tx_ts_idx ON aml_transactions (ts);

  CREATE TABLE IF NOT EXISTS aml_findings (
    id UUID PRIMARY KEY,
    entity_name TEXT NOT NULL,
    flag_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence REAL NOT NULL,
    evidence_tx_ids UUID[] NOT NULL,
    metrics JSONB NOT NULL,
    rationale TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    narrative TEXT,
    status TEXT NOT NULL DEFAULT 'proposed',
    detected_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS aml_findings_entity_flag_idx
    ON aml_findings (lower(entity_name), flag_type);
  CREATE INDEX IF NOT EXISTS aml_findings_status_idx ON aml_findings (status);

  CREATE TABLE IF NOT EXISTS aml_finding_decisions (
    id UUID PRIMARY KEY,
    finding_id UUID NOT NULL REFERENCES aml_findings(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    actor TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS aml_finding_decisions_finding_idx ON aml_finding_decisions (finding_id);
`);

// ---- Transactions ------------------------------------------------------------

/** Bulk-insert a synthetic transaction feed; replaces any existing rows for the entity. */
export async function replaceTransactions(entityName: string, txns: Transaction[]): Promise<number> {
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM aml_transactions WHERE lower(entity_name) = lower($1)`, [entityName]);
    for (const t of txns) {
      await client.query(
        `INSERT INTO aml_transactions
           (id, entity_name, ts, amount_usd, direction, counterparty, counterparty_country, cross_border, channel, synthetic)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
        [t.id, t.entityName, t.ts, t.amountUsd, t.direction, t.counterparty, t.counterpartyCountry, t.crossBorder, t.channel]
      );
    }
    await client.query("COMMIT");
    return txns.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

interface TxRow {
  id: string;
  entity_name: string;
  ts: string | Date;
  amount_usd: string;
  direction: Transaction["direction"];
  counterparty: string;
  counterparty_country: string;
  cross_border: boolean;
  channel: Transaction["channel"];
}

function rowToTx(r: TxRow): Transaction {
  return {
    id: r.id,
    entityName: r.entity_name,
    ts: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
    amountUsd: Number(r.amount_usd),
    direction: r.direction,
    counterparty: r.counterparty,
    counterpartyCountry: r.counterparty_country,
    crossBorder: r.cross_border,
    channel: r.channel,
    synthetic: true,
  };
}

export async function getTransactions(entityName: string): Promise<Transaction[]> {
  await ensureSchema();
  const { rows } = await getPool().query<TxRow>(
    `SELECT * FROM aml_transactions WHERE lower(entity_name) = lower($1) ORDER BY ts ASC`,
    [entityName]
  );
  return rows.map(rowToTx);
}

// ---- Findings ----------------------------------------------------------------

/**
 * Upserts a finding (one per entity+flag_type). Always created/kept as
 * 'proposed' — like the news-side `createAlert`, this path can never set any
 * other status; only the human `setFindingStatus` can. Re-running detection
 * refreshes the evidence/metrics but never silently confirms or escalates.
 */
export async function upsertFinding(params: {
  entityName: string;
  flagType: AmlFlagType;
  severity: AmlSeverity;
  confidence: number;
  evidenceTxIds: string[];
  metrics: Record<string, number | string>;
  rationale: string;
  recommendedAction: string;
  detectedBy: string;
}): Promise<AmlFinding> {
  await ensureSchema();
  const id = randomUUID();
  const { rows } = await getPool().query<{ id: string; created_at: string }>(
    `INSERT INTO aml_findings
       (id, entity_name, flag_type, severity, confidence, evidence_tx_ids, metrics,
        rationale, recommended_action, status, detected_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'proposed', $10)
     ON CONFLICT (lower(entity_name), flag_type) DO UPDATE SET
       severity = EXCLUDED.severity,
       confidence = EXCLUDED.confidence,
       evidence_tx_ids = EXCLUDED.evidence_tx_ids,
       metrics = EXCLUDED.metrics,
       rationale = EXCLUDED.rationale,
       recommended_action = EXCLUDED.recommended_action,
       detected_by = EXCLUDED.detected_by
     RETURNING id, created_at`,
    [
      id,
      params.entityName,
      params.flagType,
      params.severity,
      params.confidence,
      params.evidenceTxIds,
      JSON.stringify(params.metrics),
      params.rationale,
      params.recommendedAction,
      params.detectedBy,
    ]
  );
  return {
    id: rows[0].id,
    entityName: params.entityName,
    flagType: params.flagType,
    severity: params.severity,
    confidence: params.confidence,
    evidenceTxIds: params.evidenceTxIds,
    metrics: params.metrics,
    rationale: params.rationale,
    recommendedAction: params.recommendedAction,
    narrative: null,
    status: "proposed",
    detectedBy: params.detectedBy,
    createdAt: rows[0].created_at,
  };
}

interface FindingRow {
  id: string;
  entity_name: string;
  flag_type: AmlFlagType;
  severity: AmlSeverity;
  confidence: number;
  evidence_tx_ids: string[];
  metrics: Record<string, number | string>;
  rationale: string;
  recommended_action: string;
  narrative: string | null;
  status: AmlStatus;
  detected_by: string;
  created_at: string;
}

function rowToFinding(r: FindingRow): AmlFinding {
  return {
    id: r.id,
    entityName: r.entity_name,
    flagType: r.flag_type,
    severity: r.severity,
    confidence: r.confidence,
    evidenceTxIds: r.evidence_tx_ids,
    metrics: r.metrics,
    rationale: r.rationale,
    recommendedAction: r.recommended_action,
    narrative: r.narrative,
    status: r.status,
    detectedBy: r.detected_by,
    createdAt: r.created_at,
  };
}

export async function getFindings(filter?: { entityName?: string; status?: AmlStatus }): Promise<AmlFinding[]> {
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
  // Severity-ordered so "the top finding per entity" is the first row per entity.
  const { rows } = await getPool().query<FindingRow>(
    `SELECT * FROM aml_findings ${where}
     ORDER BY array_position(ARRAY['critical','high','medium','low'], severity), created_at DESC`,
    params
  );
  return rows.map(rowToFinding);
}

export async function getFindingById(id: string): Promise<AmlFinding | null> {
  await ensureSchema();
  const { rows } = await getPool().query<FindingRow>(`SELECT * FROM aml_findings WHERE id = $1`, [id]);
  return rows.length ? rowToFinding(rows[0]) : null;
}

export async function setFindingNarrative(id: string, narrative: string, detectedBy: string, confidence: number): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE aml_findings SET narrative = $1, detected_by = $2, confidence = $3 WHERE id = $4`,
    [narrative, detectedBy, confidence, id]
  );
}

/**
 * Human-in-the-loop guardrail (mirrors the news-side `setAlertStatus`): the only
 * function allowed to change a finding's status, writing an append-only audit
 * row in the same transaction so status and trail can never disagree.
 */
export async function setFindingStatus(
  id: string,
  status: AmlStatus,
  actor: string,
  note?: string
): Promise<boolean> {
  await ensureSchema();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ status: AmlStatus }>(
      `SELECT status FROM aml_findings WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0 || rows[0].status === status) {
      await client.query("ROLLBACK");
      return false;
    }
    const fromStatus = rows[0].status;
    await client.query(`UPDATE aml_findings SET status = $1 WHERE id = $2`, [status, id]);
    await client.query(
      `INSERT INTO aml_finding_decisions (id, finding_id, from_status, to_status, actor, note)
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
  finding_id: string;
  from_status: AmlStatus;
  to_status: AmlStatus;
  actor: string;
  note: string | null;
  created_at: string;
}

export async function getFindingDecisions(findingId: string): Promise<AmlFindingDecision[]> {
  await ensureSchema();
  const { rows } = await getPool().query<DecisionRow>(
    `SELECT * FROM aml_finding_decisions WHERE finding_id = $1 ORDER BY created_at ASC`,
    [findingId]
  );
  return rows.map((r) => ({
    id: r.id,
    findingId: r.finding_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    actor: r.actor,
    note: r.note,
    createdAt: r.created_at,
  }));
}

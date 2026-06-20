import { defineSchema, getPool } from "../db";
import type { Stage1Classification } from "./stage1";

const ensureSchema = defineSchema(`
  ALTER TABLE IF EXISTS stage1_classifications RENAME TO signal_triage;
  ALTER INDEX IF EXISTS stage1_passed_idx RENAME TO signal_triage_passed_idx;
  CREATE TABLE IF NOT EXISTS signal_triage (
    signal_id UUID PRIMARY KEY REFERENCES signals(id) ON DELETE CASCADE,
    passed BOOLEAN NOT NULL,
    top_category_id TEXT,
    top_category_label TEXT,
    top_score REAL,
    matches JSONB NOT NULL,
    classified_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS signal_triage_passed_idx ON signal_triage (passed);
`);

export async function recordStage1Classification(
  signalId: string,
  classification: Stage1Classification
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO signal_triage
       (signal_id, passed, top_category_id, top_category_label, top_score, matches, classified_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (signal_id) DO UPDATE SET
       passed = EXCLUDED.passed,
       top_category_id = EXCLUDED.top_category_id,
       top_category_label = EXCLUDED.top_category_label,
       top_score = EXCLUDED.top_score,
       matches = EXCLUDED.matches,
       classified_at = EXCLUDED.classified_at`,
    [
      signalId,
      classification.passed,
      classification.topMatch?.categoryId ?? null,
      classification.topMatch?.categoryLabel ?? null,
      classification.topMatch?.score ?? null,
      JSON.stringify(classification.matches),
      classification.classifiedAt,
    ]
  );
}

interface ClassificationRow {
  signal_id: string;
  passed: boolean;
  matches: Stage1Classification["matches"];
  classified_at: string;
}

/** Volume resolved by the free Stage 1 filter vs. passed through to the paid LLM stage. */
export async function getTriageStats(): Promise<{ triaged: number; passed: number; filtered: number }> {
  await ensureSchema();
  const { rows } = await getPool().query<{ triaged: string; passed: string }>(
    `SELECT count(*) AS triaged, count(*) FILTER (WHERE passed) AS passed FROM signal_triage`
  );
  const triaged = Number(rows[0].triaged);
  const passed = Number(rows[0].passed);
  return { triaged, passed, filtered: triaged - passed };
}

export async function getStage1Classifications(
  signalIds: string[]
): Promise<Map<string, Stage1Classification>> {
  await ensureSchema();
  if (signalIds.length === 0) return new Map();
  const { rows } = await getPool().query<ClassificationRow>(
    `SELECT signal_id, passed, matches, classified_at FROM signal_triage WHERE signal_id = ANY($1)`,
    [signalIds]
  );
  const result = new Map<string, Stage1Classification>();
  for (const row of rows) {
    result.set(row.signal_id, {
      passed: row.passed,
      topMatch: row.matches[0] ?? null,
      matches: row.matches,
      classifiedAt: row.classified_at,
    });
  }
  return result;
}

import { getPool } from "../db";
import type { Stage1Classification } from "./stage1";

let schemaReady: Promise<void> | null = null;

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS stage1_classifications (
    signal_id UUID PRIMARY KEY REFERENCES signals(id) ON DELETE CASCADE,
    passed BOOLEAN NOT NULL,
    top_category_id TEXT,
    top_category_label TEXT,
    top_score REAL,
    matches JSONB NOT NULL,
    classified_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS stage1_passed_idx ON stage1_classifications (passed);
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

export async function recordStage1Classification(
  signalId: string,
  classification: Stage1Classification
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO stage1_classifications
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

export async function getStage1Classifications(
  signalIds: string[]
): Promise<Map<string, Stage1Classification>> {
  await ensureSchema();
  if (signalIds.length === 0) return new Map();
  const { rows } = await getPool().query<ClassificationRow>(
    `SELECT signal_id, passed, matches, classified_at FROM stage1_classifications WHERE signal_id = ANY($1)`,
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

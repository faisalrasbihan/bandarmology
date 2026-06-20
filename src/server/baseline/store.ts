import { randomUUID } from "crypto";
import { defineSchema, getPool } from "../db";
import type { KycBaseline, RiskRating } from "./types";

const ensureSchema = defineSchema(`
  CREATE TABLE IF NOT EXISTS kyc_baselines (
    entity_id UUID PRIMARY KEY,
    company_name TEXT NOT NULL,
    expected_sectors TEXT[] NOT NULL DEFAULT '{}',
    expected_countries TEXT[] NOT NULL DEFAULT '{}',
    expected_business_model TEXT NOT NULL,
    expected_tx_volume_range TEXT NOT NULL,
    ownership_structure TEXT[] NOT NULL DEFAULT '{}',
    risk_rating TEXT NOT NULL,
    onboarded_at TIMESTAMPTZ NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS kyc_baselines_company_idx ON kyc_baselines (lower(company_name));
`);

interface BaselineRow {
  entity_id: string;
  company_name: string;
  expected_sectors: string[];
  expected_countries: string[];
  expected_business_model: string;
  expected_tx_volume_range: string;
  ownership_structure: string[];
  risk_rating: RiskRating;
  onboarded_at: string;
}

function rowToBaseline(row: BaselineRow): KycBaseline {
  return {
    entityId: row.entity_id,
    companyName: row.company_name,
    expectedSectors: row.expected_sectors,
    expectedCountries: row.expected_countries,
    expectedBusinessModel: row.expected_business_model,
    expectedTxVolumeRange: row.expected_tx_volume_range,
    ownershipStructure: row.ownership_structure,
    riskRating: row.risk_rating,
    onboardedAt: row.onboarded_at,
  };
}

export async function upsertBaseline(b: Omit<KycBaseline, "entityId"> & { entityId?: string }): Promise<KycBaseline> {
  await ensureSchema();
  // Idempotent by company name: reuse the existing row's id so re-seeding
  // upserts via ON CONFLICT (entity_id) instead of colliding on the unique
  // lower(company_name) index.
  let entityId = b.entityId;
  if (!entityId) {
    const { rows } = await getPool().query<{ entity_id: string }>(
      `SELECT entity_id FROM kyc_baselines WHERE lower(company_name) = lower($1)`,
      [b.companyName]
    );
    entityId = rows[0]?.entity_id ?? randomUUID();
  }
  await getPool().query(
    `INSERT INTO kyc_baselines
       (entity_id, company_name, expected_sectors, expected_countries, expected_business_model,
        expected_tx_volume_range, ownership_structure, risk_rating, onboarded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (entity_id) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       expected_sectors = EXCLUDED.expected_sectors,
       expected_countries = EXCLUDED.expected_countries,
       expected_business_model = EXCLUDED.expected_business_model,
       expected_tx_volume_range = EXCLUDED.expected_tx_volume_range,
       ownership_structure = EXCLUDED.ownership_structure,
       risk_rating = EXCLUDED.risk_rating,
       onboarded_at = EXCLUDED.onboarded_at`,
    [
      entityId,
      b.companyName,
      b.expectedSectors,
      b.expectedCountries,
      b.expectedBusinessModel,
      b.expectedTxVolumeRange,
      b.ownershipStructure,
      b.riskRating,
      b.onboardedAt,
    ]
  );
  return { ...b, entityId };
}

export async function getBaselines(): Promise<KycBaseline[]> {
  await ensureSchema();
  const { rows } = await getPool().query<BaselineRow>(`SELECT * FROM kyc_baselines ORDER BY company_name ASC`);
  return rows.map(rowToBaseline);
}

/** Case-insensitive lookup by company name — the Stage 3 join key against a Layer 1 entityHint. */
export async function getBaselineByCompany(companyName: string): Promise<KycBaseline | null> {
  await ensureSchema();
  const { rows } = await getPool().query<BaselineRow>(
    `SELECT * FROM kyc_baselines WHERE lower(company_name) = lower($1) LIMIT 1`,
    [companyName]
  );
  return rows.length ? rowToBaseline(rows[0]) : null;
}

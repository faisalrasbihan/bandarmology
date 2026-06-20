import { randomUUID } from "crypto";
import { defineSchema, getPool } from "../db";

/**
 * Layer 2 — synthetic relationship/commercial profile that sits alongside the
 * KYC baseline. These are fields a real bank holds internally (relationship
 * type, exposure, relationship manager, watchlist status) but that aren't part
 * of the public KYC baseline and aren't derivable from Layer 1 signals — so for
 * the demo they're *synthetic*, stored in their own `client_profiles` table.
 * Like `kyc_baselines` this is internal (Layer 2) data and is never merged into
 * the Layer 1 `signals` store; the dashboard join (see src/server/dashboard) is
 * the explicit, read-only place it meets Layer 1 for presentation.
 */

export interface WatchlistMeta {
  reason: string;
  addedBy: string;
  addedOn: string;
  reviewBy: string;
}

export interface ClientProfile {
  entityId: string;
  companyName: string;
  relationship: string;
  exposureUsd: number;
  displaySector: string;
  jurisdiction: string;
  relationshipManager: string;
  watchlist: boolean;
  watchlistMeta: WatchlistMeta | null;
}

const ensureSchema = defineSchema(`
  CREATE TABLE IF NOT EXISTS client_profiles (
    entity_id UUID PRIMARY KEY,
    company_name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    exposure_usd BIGINT NOT NULL,
    display_sector TEXT NOT NULL,
    jurisdiction TEXT NOT NULL,
    relationship_manager TEXT NOT NULL,
    watchlist BOOLEAN NOT NULL DEFAULT false,
    watchlist_meta JSONB
  );
  CREATE UNIQUE INDEX IF NOT EXISTS client_profiles_company_idx ON client_profiles (lower(company_name));
`);

interface ProfileRow {
  entity_id: string;
  company_name: string;
  relationship: string;
  exposure_usd: string;
  display_sector: string;
  jurisdiction: string;
  relationship_manager: string;
  watchlist: boolean;
  watchlist_meta: WatchlistMeta | null;
}

function rowToProfile(row: ProfileRow): ClientProfile {
  return {
    entityId: row.entity_id,
    companyName: row.company_name,
    relationship: row.relationship,
    exposureUsd: Number(row.exposure_usd),
    displaySector: row.display_sector,
    jurisdiction: row.jurisdiction,
    relationshipManager: row.relationship_manager,
    watchlist: row.watchlist,
    watchlistMeta: row.watchlist_meta,
  };
}

export async function upsertClientProfile(
  p: Omit<ClientProfile, "entityId"> & { entityId?: string }
): Promise<ClientProfile> {
  await ensureSchema();
  const entityId = p.entityId ?? randomUUID();
  await getPool().query(
    `INSERT INTO client_profiles
       (entity_id, company_name, relationship, exposure_usd, display_sector,
        jurisdiction, relationship_manager, watchlist, watchlist_meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (entity_id) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       relationship = EXCLUDED.relationship,
       exposure_usd = EXCLUDED.exposure_usd,
       display_sector = EXCLUDED.display_sector,
       jurisdiction = EXCLUDED.jurisdiction,
       relationship_manager = EXCLUDED.relationship_manager,
       watchlist = EXCLUDED.watchlist,
       watchlist_meta = EXCLUDED.watchlist_meta`,
    [
      entityId,
      p.companyName,
      p.relationship,
      p.exposureUsd,
      p.displaySector,
      p.jurisdiction,
      p.relationshipManager,
      p.watchlist,
      p.watchlistMeta ? JSON.stringify(p.watchlistMeta) : null,
    ]
  );
  return { ...p, entityId, watchlistMeta: p.watchlistMeta ?? null };
}

export async function getClientProfiles(): Promise<ClientProfile[]> {
  await ensureSchema();
  const { rows } = await getPool().query<ProfileRow>(
    `SELECT * FROM client_profiles ORDER BY company_name ASC`
  );
  return rows.map(rowToProfile);
}

export async function getClientProfileByCompany(companyName: string): Promise<ClientProfile | null> {
  await ensureSchema();
  const { rows } = await getPool().query<ProfileRow>(
    `SELECT * FROM client_profiles WHERE lower(company_name) = lower($1) LIMIT 1`,
    [companyName]
  );
  return rows.length ? rowToProfile(rows[0]) : null;
}

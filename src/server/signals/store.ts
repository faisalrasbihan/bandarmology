import { defineSchema, getPool } from "../db";
import type { Signal, SignalSource } from "./types";

/**
 * Postgres-backed dedupe store. Keyed on a normalized URL, with a normalized
 * title+day fallback so the same story reported by two different sources under
 * two different URLs is still recognized as one signal rather than stored twice.
 * This embedded DDL is the single source of truth for the `signals` table.
 */
const ensureSchema = defineSchema(`
  CREATE TABLE IF NOT EXISTS signals (
    id UUID PRIMARY KEY,
    entity_hint TEXT NOT NULL,
    source TEXT NOT NULL,
    merged_sources TEXT[] NOT NULL DEFAULT '{}',
    title TEXT NOT NULL,
    snippet TEXT,
    url TEXT NOT NULL,
    url_key TEXT NOT NULL,
    title_day_key TEXT NOT NULL,
    published_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ NOT NULL,
    sectors TEXT[] NOT NULL DEFAULT '{}',
    countries TEXT[] NOT NULL DEFAULT '{}',
    keywords TEXT[] NOT NULL DEFAULT '{}',
    raw JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS signals_url_key_idx ON signals (url_key);
  CREATE INDEX IF NOT EXISTS signals_title_day_key_idx ON signals (title_day_key);
  CREATE INDEX IF NOT EXISTS signals_entity_hint_idx ON signals (lower(entity_hint));
`);

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const params = new URLSearchParams(u.search);
    for (const key of [...params.keys()]) {
      if (/^utm_|^(fbclid|gclid|ref|ref_src|cmpid)$/i.test(key)) params.delete(key);
    }
    const query = params.toString();
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase()}${path}${query ? `?${query}` : ""}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dayKey(signal: Signal): string {
  const date = signal.publishedAt ?? signal.fetchedAt;
  return date.slice(0, 10); // YYYY-MM-DD
}

function titleDayKey(signal: Signal): string {
  return `${normalizeTitle(signal.title)}::${dayKey(signal)}`;
}

interface SignalRow {
  id: string;
  entity_hint: string;
  source: SignalSource;
  merged_sources: SignalSource[];
  title: string;
  snippet: string | null;
  url: string;
  published_at: string | null;
  fetched_at: string;
  sectors: string[];
  countries: string[];
  keywords: string[];
  raw: Record<string, unknown> | null;
}

function rowToSignal(row: SignalRow): Signal {
  return {
    id: row.id,
    entityHint: row.entity_hint,
    source: row.source,
    mergedSources: row.merged_sources.length ? row.merged_sources : undefined,
    title: row.title,
    snippet: row.snippet ?? undefined,
    url: row.url,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    tags: { sectors: row.sectors, countries: row.countries, keywords: row.keywords },
    raw: row.raw ?? undefined,
  };
}

/**
 * Inserts signals into the store, deduplicating two ways:
 * 1. Exact: same normalized URL (same article via the same or different fetch).
 * 2. Cross-source: same normalized title + same calendar day (e.g. GDELT and
 *    Google News both surfacing the same underlying story via different
 *    aggregator URLs). The first-seen signal is kept as canonical; later
 *    sources reporting the same item are recorded in `mergedSources` rather
 *    than dropped silently, since cross-source corroboration is itself a
 *    useful signal for Stage 1 confidence scoring.
 *
 * Processes signals sequentially per call to keep the dedupe check simple
 * (read-then-write); fine for hackathon ingest volume. A high-throughput
 * version would batch this into a single multi-row upsert.
 */
export async function upsertSignals(
  signals: Signal[]
): Promise<{ inserted: Signal[]; duplicates: number }> {
  await ensureSchema();
  const pool = getPool();
  const inserted: Signal[] = [];
  let duplicates = 0;

  for (const signal of signals) {
    const urlKey = normalizeUrl(signal.url);
    const tdKey = titleDayKey(signal);

    const { rows } = await pool.query<{ id: string; source: SignalSource; merged_sources: SignalSource[] }>(
      `SELECT id, source, merged_sources FROM signals WHERE url_key = $1 OR title_day_key = $2 LIMIT 1`,
      [urlKey, tdKey]
    );

    if (rows.length) {
      duplicates++;
      const existing = rows[0];
      if (existing.source !== signal.source && !existing.merged_sources.includes(signal.source)) {
        await pool.query(`UPDATE signals SET merged_sources = array_append(merged_sources, $1) WHERE id = $2`, [
          signal.source,
          existing.id,
        ]);
      }
      continue;
    }

    await pool.query(
      `INSERT INTO signals
        (id, entity_hint, source, title, snippet, url, url_key, title_day_key,
         published_at, fetched_at, sectors, countries, keywords, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (url_key) DO NOTHING`,
      [
        signal.id,
        signal.entityHint,
        signal.source,
        signal.title,
        signal.snippet ?? null,
        signal.url,
        urlKey,
        tdKey,
        signal.publishedAt,
        signal.fetchedAt,
        signal.tags.sectors,
        signal.tags.countries,
        signal.tags.keywords,
        signal.raw ?? null,
      ]
    );
    inserted.push(signal);
  }

  return { inserted, duplicates };
}

export async function getStoredSignals(filter?: { entityHint?: string }): Promise<Signal[]> {
  await ensureSchema();
  const pool = getPool();
  const { rows } = filter?.entityHint
    ? await pool.query<SignalRow>(`SELECT * FROM signals WHERE lower(entity_hint) = lower($1) ORDER BY fetched_at DESC`, [
        filter.entityHint,
      ])
    : await pool.query<SignalRow>(`SELECT * FROM signals ORDER BY fetched_at DESC`);
  return rows.map(rowToSignal);
}

export async function getSignalsByIds(ids: string[]): Promise<Signal[]> {
  await ensureSchema();
  if (ids.length === 0) return [];
  const { rows } = await getPool().query<SignalRow>(`SELECT * FROM signals WHERE id = ANY($1)`, [ids]);
  return rows.map(rowToSignal);
}

/** Test/demo-reset hook — not used in normal request handling. */
export async function clearStore(): Promise<void> {
  await ensureSchema();
  await getPool().query(`TRUNCATE signals`);
}

-- Layer 1 signal store. Run automatically on first store access (see store.ts
-- ensureSchema()) — no migration framework for the hackathon scope, but the
-- DDL is idempotent (IF NOT EXISTS) so it's safe to re-run or to use as a
-- starting point for a real migration later.

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

# Amina Risk Profiling — Dynamic Risk Profiling System

A real-time intelligence prototype for the AMINA Bank "Dynamic Risk Profiling System"
challenge. It fuses public risk signals (news, sanctions, registries) with a simulated
internal KYC/AML profile to surface early risk flags and detect KYC drift.

See [src/server/ARCHITECTURE.md](./src/server/ARCHITECTURE.md) for the full system design
and [CLAUDE.md](./CLAUDE.md) for instructions Claude Code follows when working in this repo.

## Status

This repo currently implements **Layer 1, Stage 0 (ingestion) and Stage 1 (cheap filter)**,
plus a shadcn/ui-based frontend shell. No LLM call exists yet (Stage 2/3, drift detection,
wired-up UI) — see `src/server/ARCHITECTURE.md` for the planned pipeline.

## Stack

- Next.js 16 (App Router), TypeScript, ESLint, Tailwind CSS, shadcn/ui (`src/components/ui/`)
- Backend logic under `src/server/`; `src/app/api/` stays a thin routing layer over it
- Postgres for the signal store (`src/server/db.ts`, `src/server/signals/store.ts`) — fetchers
  themselves remain stateless, the store is the only stateful piece

## Setup

```bash
npm install
npm run dev   # http://localhost:3000
```

### Database

Needs a Postgres instance. For local dev:

```bash
docker run -d --name amina-risk-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=amina_risk_profiling -p 5433:5432 postgres:15
```

Set `DATABASE_URL` in `.env.local` (see below). Schema (`src/server/signals/schema.sql`) is
applied automatically on first request — no separate migration step needed for this build.

### Source-by-source setup

| Source | Auth required? | Setup |
| --- | --- | --- |
| Google News RSS | No | Works out of the box. Undocumented, informal rate limits — keep request volume modest. |
| GDELT DOC 2.0 API | No | Works out of the box. Frequently rate-limits shared/datacenter IPs with `429`; this is normal in cloud sandboxes/CI and not a code bug. Errors are caught and surfaced per-source, not thrown. |
| OpenSanctions | **Yes, now** | The public default index used to allow light unauthenticated use; as of this build it returns `401 Unauthorized` without a key. Sign up for a free key at https://www.opensanctions.org/api/ and set `OPENSANCTIONS_API_KEY` in `.env.local`. The fetcher works with or without it — it just adds the `Authorization: ApiKey ...` header when the env var is present. |
| NewsAPI | **Yes, always** | No usable free unauthenticated tier. Sign up for a free key at https://newsapi.org/register and set `NEWSAPI_API_KEY`. Without it, this source returns a per-source error (others still work). |
| Mediastack | **Yes, always** | Sign up for a free key at https://mediastack.com/signup/free and set `MEDIASTACK_API_KEY`. Free tier only supports plain HTTP for the API endpoint (vendor limitation). |

No setup is required to see the pipeline working end-to-end — Google News RSS alone
returns real results immediately. The others are additive.

### Environment variables

Create `.env.local`:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5433/amina_risk_profiling   # required, see Database above
OPENSANCTIONS_API_KEY=your_key_here   # optional, see table above
NEWSAPI_API_KEY=your_key_here         # required for the newsapi source
MEDIASTACK_API_KEY=your_key_here      # required for the mediastack source
```

## Usage

```
GET /api/signals?company=<name>&aliases=<csv>&sectors=<csv>&countries=<csv>&maxResults=<n>
```

Example:

```bash
curl "http://localhost:3000/api/signals?company=Tesla&aliases=Tesla%20Inc&sectors=automotive&countries=US&maxResults=10"
```

Returns:

```json
{
  "query": { "...": "the resolved query" },
  "count": 7,
  "duplicates": 2,
  "stage1": { "survived": 1, "filtered": 6 },
  "signals": [
    {
      "id": "...", "source": "google_news_rss", "title": "...",
      "tags": { "sectors": ["automotive"], "countries": ["US"], "keywords": [] },
      "stage1": {
        "passed": true,
        "topMatch": { "categoryId": "ownership_control_change", "categoryLabel": "Ownership / Control Change", "score": 0.5, "matchedKeywords": ["merger"] },
        "matches": [ "..." ],
        "classifiedAt": "..."
      },
      "...": "..."
    }
  ],
  "errors": [ { "source": "gdelt", "message": "GDELT request failed: 429 Too Many Requests" } ]
}
```

Fetchers run concurrently via `Promise.allSettled` — one source failing (rate limit, auth,
network) never drops the others. Errors are returned alongside whatever signals did
succeed, which matters for a compliance pipeline: partial data with a visible gap is safer
than a silent drop or an all-or-nothing failure.

`signals` is the set of **newly seen** items from this call — already-known items are
counted in `duplicates`, not repeated in the response, so polling the same query
periodically returns only what's new each time. Every returned signal carries a `stage1`
classification (see below). To see everything accumulated so far (across all calls, for a
given entity), optionally narrowed to one side of the Stage 1 triage, use:

```
GET /api/signals/store?entityHint=<name>&stage1=survived|filtered
```

### Deduplication

Every ingested signal is upserted into Postgres (`src/server/signals/store.ts`, schema in
`schema.sql`) keyed by a unique index on normalized URL, with a secondary fuzzy match on
normalized title + calendar day. This catches both same-source re-fetches and the common
case of two sources (e.g. GDELT and Google News) independently reporting the same
underlying story via different URLs. The first-seen signal is kept as canonical; later
sources reporting the same item are recorded in `mergedSources` rather than dropped —
cross-source corroboration is a useful input for Stage 1 confidence scoring later. Storage
is sequential per-signal (read-then-write), which is simple and fine for hackathon ingest
volume; a high-throughput version would batch this into a single multi-row upsert.

### Stage 1 cheap filter

Every newly-stored signal is scored against an 11-category risk taxonomy
(`src/server/filter/taxonomy.ts` — sanctions, adverse media, financial distress, cyber
incident, regulatory/legal action, ownership/control change, leadership change, business
model drift, jurisdiction risk, litigation, PEP exposure) using two free, non-LLM signals:
exact keyword matches and lightweight lexical (token-overlap) similarity against each
category's description. No network calls, no LLM — this is the "free" triage step that runs
on every signal before anything reaches Stage 2. See `src/server/ARCHITECTURE.md` § Stage 1:
cheap filter for the scoring details and rationale. Results persist in a separate
`stage1_classifications` table, joined back onto signals via `entityHint`/`id`, never merged
into the Stage 0 `signals` table — each pipeline stage's output stays independently
auditable.

## Project layout

```
src/server/
  ARCHITECTURE.md           Full system design — read before non-trivial backend changes
  db.ts                     Postgres pool (getPool()), reads DATABASE_URL
  signals/
    types.ts                Signal, SignalTags, FetchQuery, FetchError
    schema.sql               signals table DDL (also embedded in store.ts, kept in sync)
    fetchers/
      googleNewsRss.ts
      gdelt.ts
      openSanctions.ts
      newsapi.ts
      mediastack.ts
    store.ts                 upsertSignals()/getStoredSignals() — Postgres-backed dedupe store
    index.ts                 fetchAllSignals(), ingestSignals() — fetch, merge, store, dedupe, Stage 1
  filter/
    taxonomy.ts              RISK_TAXONOMY — 11-category risk taxonomy
    stage1.ts                classifySignal() — keyword + lexical-overlap scorer
    store.ts                 recordStage1Classification()/getStage1Classifications() (Postgres)
    index.ts                 runStage1(), attachStage1Classifications()
src/app/api/signals/route.ts         GET endpoint wrapping ingestSignals() (Stage 0 + Stage 1)
src/app/api/signals/store/route.ts   GET endpoint wrapping getStoredSignals() + Stage 1 join
src/components/ui/             shadcn/ui frontend components
```

## Next steps (not yet built)

1. Stage 2/3 LLM classification against the flag taxonomy, with structured output + citations
2. Layer 2 simulated KYC baseline + drift diff logic
3. Sector/country tag-based routing — see `src/server/ARCHITECTURE.md` § Entity Tagging & Routing
4. UI: alert feed, entity timeline, explainability panel
5. GDELT theme-based batched queries (one query per active sector/country tag-pair instead
   of per-client) to scale past a handful of clients — see `src/server/ARCHITECTURE.md`
   § Scaling GDELT beyond a handful of clients
6. If Stage 1 recall proves too low on real data, swap the lexical-overlap scorer for a real
   local embedding model (e.g. transformers.js) — see `src/server/ARCHITECTURE.md` § Stage 1:
   cheap filter

# Amina Risk Profiling — Dynamic Risk Profiling System

A real-time intelligence prototype for the AMINA Bank "Dynamic Risk Profiling System"
challenge. It fuses public risk signals (news, sanctions, registries) with a simulated
internal KYC/AML profile to surface early risk flags and detect KYC drift.

See [src/server/ARCHITECTURE.md](./src/server/ARCHITECTURE.md) for the full system design
and [CLAUDE.md](./CLAUDE.md) for instructions Claude Code follows when working in this repo.

## Status

This repo implements the full pipeline end-to-end: **Layer 1 Stage 0 (ingestion) → Stage 1
(cheap filter) → Stage 2 (LLM classify) → Stage 3 (deep analysis / KYC drift)** against a
**Layer 2** simulated KYC baseline, plus a wired-up alerts UI at `/alerts`. See
`src/server/ARCHITECTURE.md` for the design. The remaining "Next steps" (below) are
hardening items (RBAC, tag routing, GDELT scaling), not missing pipeline stages.

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

Set `DATABASE_URL` in `.env.local` (see below). Each module's table DDL is embedded in its
store and applied automatically on first request (via `defineSchema` in `src/server/db.ts`) —
no separate migration step needed for this build.

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
ANTHROPIC_API_KEY=your_key_here       # required for Stage 2 (LLM classify) — see https://console.anthropic.com/
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

Every ingested signal is upserted into Postgres (`src/server/signals/store.ts`) keyed by a
unique index on normalized URL, with a secondary fuzzy match on
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
`signal_triage` table, joined back onto signals via `entityHint`/`id`, never merged
into the Stage 0 `signals` table — each pipeline stage's output stays independently
auditable.

### Stage 2 LLM classify

```
POST /api/alerts/generate?entityHint=<name>&limit=<n>
```

Classifies up to `limit` (default 10) Stage-1-survivor signals for `entityHint` that don't
already have an alert, using Claude Haiku 4.5. **Triggered explicitly** — never run
automatically by `/api/signals`, so every LLM call is a deliberate, attributable cost.
Requires `ANTHROPIC_API_KEY`.

```bash
curl -X POST "http://localhost:3000/api/alerts/generate?entityHint=Wirecard&limit=5"
```

Each call forces a structured tool-call response (no free-text fallback), validates it with
Zod, and checks that every cited signal id was actually given to the model — reject/retry
once on any violation, never silent acceptance. The model also judges entity relevance
(`concernsEntity`): a same-name-different-company or passing-mention hit is suppressed rather
than turned into a false-positive alert. Corroboration (how many independent sources reported
the same story, from the dedup `mergedSources`) is fed into the prompt to calibrate
confidence. Every Alert is created with `status: "proposed"`; nothing in the pipeline can set
any other status.

For cost-sensitive bulk runs, add `&mode=batch` to submit via the Message Batches API (50%
cheaper, asynchronous). It returns a `batchId`; collect the results once processed:

```bash
curl -X POST "http://localhost:3000/api/alerts/generate?entityHint=Wirecard&mode=batch"
curl -X POST "http://localhost:3000/api/alerts/batch/<batchId>/collect"
```

```
GET   /api/alerts?entityHint=<name>&status=<proposed|confirmed|escalated|dismissed>
GET   /api/alerts/<id>        full alert: resolved citation sources, drift findings, decisions
PATCH /api/alerts/<id>        { "status": "confirmed", "actor": "analyst@amina", "note": "..." }
GET   /api/cost-summary
```

`PATCH` is the only way an alert's status changes — an explicit, human-initiated call that
**requires an `actor`** and writes an append-only audit row (who, from→to, when, note) in the
same transaction. `GET /api/alerts/<id>` expands `citations` into clickable source title+URL
(grounding you can verify), and includes any Stage 3 drift findings and the decision history.
`/api/cost-summary` aggregates every logged LLM call (success or failure) into total spend,
cost-per-1000-alerts, and the share of signal volume resolved by the free Stage 1 filter
without any LLM call.

### Stage 3 deep analysis (KYC drift) + Layer 2

Stage 3 is the marquee "dynamic risk profiling" step: it compares a flagged Layer 1 signal
against the entity's **Layer 2 KYC baseline** (what AMINA assumed at onboarding) to detect
*drift* — e.g. a payments firm onboarded as medium-risk now mired in fraud and insolvency.
Layer 1 (public) and Layer 2 (simulated internal) live in **separate modules and Postgres
tables** and only meet here, in one explicit, logged join — the data-separation guardrail in
`CLAUDE.md`.

```bash
# Load the demo KYC baselines (idempotent), then analyze one alert:
curl -X POST "http://localhost:3000/api/baselines/seed"
curl -X POST "http://localhost:3000/api/alerts/<id>/analyze"
```

Stage 3 uses a stronger model (Sonnet 4.6), is triggered explicitly per alert (escalated /
rare / higher cost), and emits a per-dimension baseline-vs-observed comparison, a severity, a
case narrative, and recommended actions — same enforce-don't-trust contract as Stage 2
(forced tool call, Zod validation, citation grounding, retry once). `GET /api/baselines` lists
the baselines.

## Frontend

A working alerts console lives at **`/alerts`** (also linked in the sidebar). It shows the
cost-efficiency header (cost/1k alerts, % resolved without an LLM), the live alert feed with
confidence and status, and an expandable detail per alert: clickable source citations, the
Stage 3 drift table when present, full decision history, and Confirm/Escalate/Dismiss/Analyze
actions that call the APIs above (with the acting analyst recorded for the audit log).

## Project layout

```
src/server/
  ARCHITECTURE.md           Full system design — read before non-trivial backend changes
  db.ts                     Postgres pool (getPool()) + defineSchema(ddl) helper
  anthropic.ts              Anthropic client singleton + per-model token-cost helpers
  signals/                  Layer 1 — public signal ingestion + dedupe
    types.ts                Signal, SignalTags, FetchQuery, FetchError
    helpers.ts              buildSearchTerm()/buildKeywordList()/toSignal() — shared by fetchers
    fetchers/               googleNewsRss, gdelt, openSanctions, newsapi, mediastack
    store.ts                upsertSignals()/getStoredSignals()/getSignalsByIds() — dedupe store
    index.ts                fetchAllSignals(), ingestSignals() — fetch, merge, store, dedupe, Stage 1
  filter/                   Stage 1 — free keyword + lexical triage
    taxonomy.ts             RISK_TAXONOMY — 11-category risk taxonomy
    stage1.ts               classifySignal() — keyword + lexical-overlap scorer
    store.ts                signal_triage table; getTriageStats() for cost metric
    index.ts                runStage1(), attachStage1Classifications()
  classify/                 Stage 2/3 — LLM classify + drift
    types.ts                Stage2/Stage3 Zod schemas, Alert, DriftFinding, AlertDecision, LlmCallLog
    stage2.ts               classifySignalWithLlm() — forced tool use, Zod + citation validation, retry
    stage3.ts               analyzeDrift() — Sonnet 4.6 drift analysis vs. Layer 2 baseline
    batch.ts                submitStage2Batch()/collectStage2Batch() — opt-in Message Batches path
    citations.ts            resolveCitations() — expand Signal.ids to title+url for the UI
    store.ts                alerts / llm_calls / alert_decisions / drift_findings persistence
    index.ts                runStage2(), runStage3(), readers, cost summary
  baseline/                 Layer 2 — simulated KYC baselines (separate store, never merged)
    types.ts                KycBaseline
    store.ts                kyc_baselines table; getBaselineByCompany() (the Stage 3 join key)
    seed.ts                 hand-authored demo baselines
src/app/api/signals/route.ts            GET — ingestSignals() (Stage 0 + Stage 1)
src/app/api/signals/store/route.ts      GET — getStoredSignals() + Stage 1 join
src/app/api/alerts/route.ts             GET — getAlerts()
src/app/api/alerts/generate/route.ts    POST — runStage2() (or ?mode=batch); only LLM-calling route
src/app/api/alerts/batch/[id]/collect/route.ts  POST — collect a Stage 2 batch
src/app/api/alerts/[id]/route.ts        GET (full detail) / PATCH (human-in-the-loop status)
src/app/api/alerts/[id]/analyze/route.ts POST — runStage3() drift analysis
src/app/api/baselines/route.ts          GET — list KYC baselines
src/app/api/baselines/seed/route.ts     POST — load demo baselines
src/app/api/cost-summary/route.ts       GET — getCostSummary()
src/app/alerts/page.tsx                 Alerts console (AppShell + AlertsView)
src/components/alerts-view.tsx          Live alert feed, drift panel, decision actions
src/components/ui/                       shadcn/ui frontend components
```

## Next steps (hardening, not missing stages)

1. **RBAC** on `PATCH /api/alerts/:id` — it records the actor but doesn't yet enforce an
   analyst vs. compliance-officer role gate.
2. Sector/country tag-based routing — see `src/server/ARCHITECTURE.md` § Entity Tagging & Routing
3. GDELT theme-based batched queries (one query per active sector/country tag-pair instead
   of per-client) to scale past a handful of clients — see `src/server/ARCHITECTURE.md`
   § Scaling GDELT beyond a handful of clients
4. If Stage 1 recall proves too low on real data, swap the lexical-overlap scorer for a real
   local embedding model (e.g. transformers.js) — see `src/server/ARCHITECTURE.md` § Stage 1:
   cheap filter

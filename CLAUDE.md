@AGENTS.md

# Amina Risk Profiling

Hackathon prototype for AMINA Bank's Dynamic Risk Profiling System challenge (SwissHacks,
19–21 June 2026). Full system design lives in [src/server/ARCHITECTURE.md](./src/server/ARCHITECTURE.md);
setup and API usage live in [README.md](./README.md). Read both before making non-trivial changes.

## Judging weights — let these drive priorities

AI Intelligence Quality 25%, Cost Efficiency 20%, UX & Explainability 20%, Compliance &
Safety 20%, Engineering & Architecture 15%. Engineering is the *lowest*-weighted criterion —
prefer a smaller number of well-explained, well-guarded features over broad infra. When in
doubt, spend time on: explainability (citations, confidence, rationale) and cost
instrumentation (token/request logging), not new connectors or abstractions.

## Non-negotiables (compliance/safety is judged)

- **Never merge Layer 1 (public) and Layer 2 (simulated internal/sensitive) data stores.**
  Keep them in separate modules/schemas. If a prompt needs both, build it through an
  explicit, auditable join step — don't let internal fields leak into a public-data fetcher
  or vice versa.
- **Every LLM-produced flag must carry: confidence score, source citation(s) tying back to
  a real ingested `Signal.id`, and a human-readable rationale.** Reject/retry on schema
  violation rather than relaxing the schema.
- **No flag auto-executes an action.** Alerts start in a `proposed` state; only an explicit
  human action moves them to `confirmed`/`escalated`. This is the human-in-the-loop
  guardrail and is part of what's being judged — don't bypass it for demo convenience.
- **Log every LLM call's token usage.** This feeds the cost-per-1000-alerts metric, which is
  directly judged. Don't add an LLM call path without wiring it through the same logger.

## Conventions in this repo

- Backend logic (fetchers, future pipeline stages) lives under `src/server/` — never
  imported from client components. `src/app/api/` stays thin: parse the request, call into
  `src/server/`, return JSON.
- Fetchers (`src/server/signals/fetchers/`) must never throw out of `fetchAllSignals` —
  one source failing should never drop the others. Follow the `Promise.allSettled` pattern
  already in `src/server/signals/index.ts`.
- New fetchers: add the module, then register it in the `FETCHERS` array in
  `src/server/signals/index.ts`. Keep the `Signal` shape (`src/server/signals/types.ts`) as
  the one normalized output format across all sources — don't leak source-specific shapes
  past the fetcher boundary except via the `raw` field.
- Run `npx tsc --noEmit` and `npm run lint` before considering a change done.
- This project uses Next.js 16, which postdates training data for most models — see
  `node_modules/next/dist/docs/` for current API reference and `AGENTS.md` for the vendor's
  agent-facing hints before relying on remembered Next.js conventions.

import data from "@/app/data.json"
import type { ClientRecord } from "@/components/client-profile"

export type FeedEvent = {
  id: string
  ts: string // YYYY-MM-DD
  time: string // HH:MM (deterministic)
  source: string
  type: string
  headline: string
  /** Source article URL, when the underlying citation has one (news signals). */
  url?: string
  clientId: number | null
  clientName: string | null
  severity: string | null
  tier: "Rules" | "LLM" | "Deep"
  confidence: number | null
  outcome: string
  costUsd: number
}

export type Pipeline = {
  ingested: number
  kept: number
  llm: number
  alerts: number
  costUsd: number
  costPer1k: number
}

// Approximate cost per item at each pipeline stage (USD).
const TIER_COST: Record<string, number> = { Rules: 0.00002, LLM: 0.004, Deep: 0.02 }

// Deterministic clock so server and client render identical times.
function clock(seed: number) {
  const m = (((seed * 197) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

// Raw Layer-1 events that were cheaply filtered out before becoming alerts —
// they populate the feed of record and make the funnel tangible.
const NOISE: [string, string, string, string, string][] = [
  ["2026-06-20", "GDELT", "Market Risk", "Sector volatility note: logistics equities slip", "Filtered — low relevance"],
  ["2026-06-20", "Google News", "Adverse Media", "Opinion column references crypto regulation broadly", "Filtered — low relevance"],
  ["2026-06-20", "NewsAPI", "Funding News", "Unrelated startup announces seed round", "No client match"],
  ["2026-06-19", "WHOIS", "Domain Change", "Routine DNS TTL change on a monitored domain", "Filtered — low relevance"],
  ["2026-06-19", "Mediastack", "Litigation", "Generic court-calendar listing, no entity match", "No client match"],
  ["2026-06-19", "SecurityTrails", "Domain Change", "Certificate renewal on client domain (expected)", "Filtered — low relevance"],
  ["2026-06-18", "GDELT", "Adverse Media", "Industry commentary mentions mining sector", "Filtered — low relevance"],
  ["2026-06-18", "Google News", "Market Risk", "FX daily wrap, no counterparty match", "No client match"],
  ["2026-06-18", "Mediastack", "Adverse Media", "Aggregator duplicate of an earlier story", "Filtered — duplicate"],
  ["2026-06-17", "NewsAPI", "Funding News", "Press release: routine product update", "Filtered — low relevance"],
  ["2026-06-17", "GDELT", "Litigation", "Small-claims notice, entity mismatch", "No client match"],
  ["2026-06-16", "WHOIS", "Domain Change", "Registrar contact field updated", "Filtered — low relevance"],
  ["2026-06-16", "Google News", "Market Risk", "Commodity price daily summary", "Filtered — low relevance"],
  ["2026-06-15", "NewsAPI", "Adverse Media", "Low-authority blog post, weak signal", "Filtered — low relevance"],
  ["2026-06-14", "GDELT", "Funding News", "Regional grant announcement, no match", "No client match"],
  ["2026-06-13", "Mediastack", "Market Risk", "Macro outlook newsletter", "Filtered — low relevance"],
]

export function buildAlertFeed(): { events: FeedEvent[]; pipeline: Pipeline } {
  const clients = data as ClientRecord[]
  const flagged = clients.filter((c) => c.flagged)
  const events: FeedEvent[] = []

  flagged.forEach((c) => {
    c.citations.forEach((cit, i) => {
      const tier = c.tier as FeedEvent["tier"]
      events.push({
        id: `a-${c.id}-${i}`,
        ts: cit.date,
        time: clock(c.id * 100 + i * 37),
        source: cit.source,
        type: c.signal,
        headline: cit.headline,
        url: cit.url,
        clientId: c.id,
        clientName: c.client,
        severity: c.severity,
        tier,
        confidence: c.confidence,
        outcome: i === 0 ? "Alert raised" : "Supporting signal",
        costUsd: TIER_COST[c.tier] ?? 0.0001,
      })
    })
  })

  NOISE.forEach(([ts, source, type, headline, outcome], i) => {
    events.push({
      id: `n-${i}`,
      ts,
      time: clock(i * 53 + 11),
      source,
      type,
      headline,
      clientId: null,
      clientName: null,
      severity: null,
      tier: "Rules",
      confidence: 0.12 + (i % 5) * 0.04,
      outcome,
      costUsd: TIER_COST.Rules,
    })
  })

  events.sort((a, b) => `${b.ts}T${b.time}`.localeCompare(`${a.ts}T${a.time}`))

  const pipeline: Pipeline = {
    ingested: 1847,
    kept: 214,
    llm: 41,
    alerts: flagged.length,
    costUsd: 1.71,
    costPer1k: 0.93,
  }

  return { events, pipeline }
}

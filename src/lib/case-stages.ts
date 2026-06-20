"use client"

import * as React from "react"

import { logAudit, type AuditAction } from "./audit-log"
import type { RiskEvent } from "./risk-events"

// ---------------------------------------------------------------------------
// Case lifecycle store. A "case" is one (event × affected client) pair that an
// analyst created by *marking* an incoming risk event. From there the case
// moves, by explicit human action only, through the funnel:
//
//   Risk Incoming → Marked → Under Investigation → Escalated → Closed
//        (event)     │            │                   │          │
//                  Clients   Investigation        Watchlist   Audit Log
//
// "Risk Incoming" is not stored here — it's the set of events that have no case
// yet. Every stored stage maps to a destination page. Each transition is an
// explicit, attributable action and is mirrored into the audit log, keeping the
// human-in-the-loop guardrail visible.
//
// Persisted in localStorage for the prototype (mirrors `audit-log.ts`); a real
// deployment would POST these transitions to the decisions store.
// ---------------------------------------------------------------------------

export type CaseStage = "marked" | "investigation" | "escalated" | "closed"

export const STAGE_ORDER: CaseStage[] = [
  "marked",
  "investigation",
  "escalated",
  "closed",
]

export const STAGE_META: Record<
  CaseStage,
  { label: string; href: string; audit: AuditAction }
> = {
  marked: { label: "Marked", href: "/clients", audit: "Marked for review" },
  investigation: {
    label: "Under Investigation",
    href: "/investigation",
    audit: "Sent to investigation",
  },
  escalated: { label: "Escalated", href: "/watchlist", audit: "Escalated" },
  closed: { label: "Closed", href: "/audit-log", audit: "Case closed" },
}

export interface CaseRecord {
  caseId: string
  eventId: string
  clientId: number
  clientName: string
  source: string
  headline: string
  severity: string
  stage: CaseStage
  updatedAt: string // ISO timestamp
}

const KEY = "amina.case-stages.v1"
const EVENT = "amina:case-stages"

export function caseId(eventId: string, clientId: number): string {
  return `${eventId}::${clientId}`
}

function readStore(): Record<string, CaseRecord> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, CaseRecord>) : {}
  } catch {
    return {}
  }
}

function writeStore(map: Record<string, CaseRecord>) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(KEY, JSON.stringify(map))
  window.dispatchEvent(new CustomEvent(EVENT))
}

/**
 * Mark an incoming event: create (or re-open) a case per affected client at the
 * "marked" stage. Each new case is also written to the audit log.
 */
export function markEvent(
  event: RiskEvent,
  clients: { id: number; client: string; severity?: string }[]
) {
  const map = readStore()
  const now = new Date().toISOString()
  for (const c of clients) {
    const id = caseId(event.id, c.id)
    if (map[id]) continue // already a case — don't reset its stage
    map[id] = {
      caseId: id,
      eventId: event.id,
      clientId: c.id,
      clientName: c.client,
      source: event.source,
      headline: event.headline,
      severity: c.severity ?? event.severity,
      stage: "marked",
      updatedAt: now,
    }
    logAudit({
      action: STAGE_META.marked.audit,
      entity: c.client,
      clientId: c.id,
      severity: map[id].severity,
      detail: event.headline,
      source: event.source,
    })
  }
  writeStore(map)
}

/** Move an existing case to a new stage (logged). */
export function setCaseStage(id: string, stage: CaseStage) {
  const map = readStore()
  const rec = map[id]
  if (!rec || rec.stage === stage) return
  rec.stage = stage
  rec.updatedAt = new Date().toISOString()
  writeStore(map)
  logAudit({
    action: STAGE_META[stage].audit,
    entity: rec.clientName,
    clientId: rec.clientId,
    severity: rec.severity,
    detail: rec.headline,
    source: rec.source,
  })
}

/** Reactive view of all cases. Empty on first render to avoid hydration drift. */
export function useCases(): CaseRecord[] {
  const [cases, setCases] = React.useState<CaseRecord[]>([])
  React.useEffect(() => {
    const sync = () => setCases(Object.values(readStore()))
    // Initial hydration from localStorage — intended, not a cascading render.
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])
  return cases
}

export interface FunnelCounts {
  incoming: number
  marked: number
  investigation: number
  escalated: number
  closed: number
}

/**
 * Counts for the five funnel stages. `incoming` is derived from the events that
 * have not produced a single case yet (an event drops out of "incoming" once
 * any of its affected clients has been marked).
 */
export function useFunnelCounts(events: RiskEvent[]): FunnelCounts {
  const cases = useCases()
  return React.useMemo(() => {
    const startedEventIds = new Set(cases.map((c) => c.eventId))
    const counts: FunnelCounts = {
      incoming: events.filter((e) => !startedEventIds.has(e.id)).length,
      marked: 0,
      investigation: 0,
      escalated: 0,
      closed: 0,
    }
    for (const c of cases) counts[c.stage] += 1
    return counts
  }, [cases, events])
}

/** Map of eventId → its cases, for rendering per-event state in the queue. */
export function useCasesByEvent(): Map<string, CaseRecord[]> {
  const cases = useCases()
  return React.useMemo(() => {
    const map = new Map<string, CaseRecord[]>()
    for (const c of cases) {
      const list = map.get(c.eventId) ?? []
      list.push(c)
      map.set(c.eventId, list)
    }
    return map
  }, [cases])
}

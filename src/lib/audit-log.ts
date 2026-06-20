"use client"

import * as React from "react"

// Client-side audit trail for analyst decisions. Every human action on an alert
// or finding (acknowledge, escalate, watchlist, …) is appended here so the
// Audit Log page can show an immutable, attributable record — this is the
// human-in-the-loop guardrail made visible. Persisted in localStorage so it
// survives reloads in the prototype; a real deployment would POST these to the
// same decisions store the backend already keeps.

export type AuditAction =
  | "Acknowledged"
  | "Escalated"
  | "Added to watchlist"
  | "Removed from watchlist"
  | "Confirmed"
  | "Marked for review"
  | "Sent to investigation"
  | "Case closed"

export interface AuditEntry {
  id: string
  ts: string // ISO timestamp
  actor: string
  action: AuditAction
  entity: string // client / entity name the action was taken on
  clientId?: number // links the entry back to a client profile when known
  severity?: string
  detail?: string
  source?: string // where the action was taken, e.g. "Risk dashboard"
}

const KEY = "amina.audit-log.v1"
const EVENT = "amina:audit-log"

// The signed-in analyst (mirrors nav-user). Real auth would supply this.
export const CURRENT_ACTOR = "hans.muller@amina.example"

// Actions that take a flagged client out of the active worklist once recorded.
const RESOLVING_ACTIONS: ReadonlySet<AuditAction> = new Set([
  "Acknowledged",
  "Escalated",
])

export function readAuditLog(): AuditEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as AuditEntry[]) : []
  } catch {
    return []
  }
}

export function logAudit(input: {
  action: AuditAction
  entity: string
  clientId?: number
  severity?: string
  detail?: string
  source?: string
  actor?: string
}): AuditEntry {
  const entry: AuditEntry = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts: new Date().toISOString(),
    actor: input.actor ?? CURRENT_ACTOR,
    action: input.action,
    entity: input.entity,
    clientId: input.clientId,
    severity: input.severity,
    detail: input.detail,
    source: input.source,
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify([entry, ...readAuditLog()]))
    window.dispatchEvent(new CustomEvent(EVENT))
  }
  return entry
}

export function clearAuditLog() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(KEY)
  window.dispatchEvent(new CustomEvent(EVENT))
}

// Reactive view of the log. Starts empty so the first client render matches the
// server (no hydration mismatch), then hydrates from localStorage on mount and
// stays in sync via the custom event (same tab) and storage event (other tabs).
export function useAuditLog(): AuditEntry[] {
  const [entries, setEntries] = React.useState<AuditEntry[]>([])
  React.useEffect(() => {
    const sync = () => setEntries(readAuditLog())
    // sync() setStates synchronously on mount; that's the intended hydration
    // step, not a cascading render.
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])
  return entries
}

// Client ids that have been resolved (acknowledged/escalated) and should drop
// out of the active worklist.
export function useResolvedClientIds(): Set<number> {
  const entries = useAuditLog()
  return React.useMemo(() => {
    const ids = new Set<number>()
    for (const e of entries) {
      if (e.clientId != null && RESOLVING_ACTIONS.has(e.action)) ids.add(e.clientId)
    }
    return ids
  }, [entries])
}

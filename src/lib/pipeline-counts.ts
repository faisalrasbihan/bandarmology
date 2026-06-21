import data from "@/app/data.json"
import investigations from "@/app/investigations.json"
import type { ClientRecord } from "@/components/client-profile"
import { RISK_EVENTS } from "./risk-events"

export interface PipelineCounts {
  incoming: number
  marked: number
  investigation: number
  escalated: number
  closed: number
}

/**
 * Funnel counts derived from the DB snapshot (data.json + investigations.json),
 * so each stage's number matches what its page actually shows and is identical
 * for every user — unlike the old per-browser localStorage workflow counters
 * (which made "Marked" read 3 while the Clients page listed 12).
 *
 * Computed server-side (imported by the page server components), so the 117 KB
 * investigations.json never ships to the client.
 */
export function getPipelineCounts(): PipelineCounts {
  const clients = data as ClientRecord[]
  const inv = investigations as Record<string, { hasActivity?: boolean }>
  return {
    // Public-intelligence intake (the dashboard queue).
    incoming: RISK_EVENTS.length,
    // Flagged clients — the Clients page worklist.
    marked: clients.filter((c) => c.flagged).length,
    // Clients that actually have a transaction-level investigation surface.
    investigation: clients.filter((c) => inv[c.client]?.hasActivity).length,
    // Clients under enhanced monitoring — the Watchlist page.
    escalated: clients.filter((c) => c.watchlist).length,
    // Resolved cases.
    closed: clients.filter((c) => c.status === "Cleared").length,
  }
}

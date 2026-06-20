import data from "@/app/data.json"
import type { ClientRecord } from "@/components/client-profile"

// ---------------------------------------------------------------------------
// Layer-1 (public) risk *events*. The dashboard's funnel is event-centric, not
// client-centric: a single event (e.g. a news story) can fan out onto several
// clients, while a sanctions or registry hit usually lands on exactly one. An
// analyst turns an event into one *case per affected client* by marking it —
// see `case-stages.ts` for the lifecycle those cases then follow.
//
// These are mocked Layer-1 signals for the prototype. They deliberately do NOT
// carry any internal/sensitive (Layer-2) fields — keeping the public and
// internal stores separate is a judged non-negotiable.
// ---------------------------------------------------------------------------

export type RiskSource =
  | "News & Adverse Media"
  | "Sanctions & Watchlists"
  | "Corporate Registry & Ownership"
  | "Funding & Startup Intelligence"
  | "Website & Domain Monitoring"

export type EventSeverity = "Critical" | "High" | "Medium" | "Low"

export interface RiskEvent {
  id: string
  source: RiskSource
  /** Short provider label shown on the citation chip. */
  provider: string
  headline: string
  summary: string
  severity: EventSeverity
  /** Cheap-filter / model confidence the event is genuinely client-relevant. */
  confidence: number
  detected: string // human-readable "Xh ago"
  /** Clients this single event touches — the fan-out at the "Mark" step. */
  affectedClientIds: number[]
  /** Public source the claim is grounded in. */
  citationUrl?: string
}

// Source ordering used to group the incoming queue.
export const SOURCE_ORDER: RiskSource[] = [
  "News & Adverse Media",
  "Sanctions & Watchlists",
  "Corporate Registry & Ownership",
  "Funding & Startup Intelligence",
  "Website & Domain Monitoring",
]

export const RISK_EVENTS: RiskEvent[] = [
  {
    id: "evt-crypto-crackdown",
    source: "News & Adverse Media",
    provider: "Reuters · GDELT",
    headline: "Regulators open coordinated probe into major crypto exchanges",
    summary:
      "Multiple jurisdictions announced a joint review of custodial exchanges' AML controls, naming several large venues. Two monitored counterparties appear in the reporting.",
    severity: "High",
    confidence: 0.78,
    detected: "1h ago",
    affectedClientIds: [1, 4], // Binance, FTX Trading Ltd
    citationUrl: "https://www.reuters.com/",
  },
  {
    id: "evt-bank-aml-enforcement",
    source: "News & Adverse Media",
    provider: "Bloomberg · NewsAPI",
    headline: "US enforcement widens AML penalties across correspondent banks",
    summary:
      "Regulators signalled expanded scrutiny of correspondent-banking AML programmes. Coverage references two banks in the portfolio with historical consent orders.",
    severity: "Medium",
    confidence: 0.64,
    detected: "4h ago",
    affectedClientIds: [2, 11], // Danske Bank, Wells Fargo
    citationUrl: "https://www.bloomberg.com/",
  },
  {
    id: "evt-tesla-oped",
    source: "News & Adverse Media",
    provider: "Mediastack",
    headline: "Opinion column criticises automaker's governance practices",
    summary:
      "Low-authority adverse-media mention. Weak signal, retained for context but unlikely to warrant action on its own.",
    severity: "Low",
    confidence: 0.31,
    detected: "9h ago",
    affectedClientIds: [10], // Tesla
  },
  {
    id: "evt-nso-entity-list",
    source: "Sanctions & Watchlists",
    provider: "US BIS Entity List",
    headline: "Entity reaffirmed on US denied-party / export-control list",
    summary:
      "Screening match against the US Entity List (denied-party / export-control designation). Direct hit on a single monitored entity.",
    severity: "High",
    confidence: 0.97,
    detected: "2h ago",
    affectedClientIds: [8], // NSO Group
    citationUrl: "https://www.bis.doc.gov/",
  },
  {
    id: "evt-nestle-pep",
    source: "Sanctions & Watchlists",
    provider: "Dow Jones PEP",
    headline: "New PEP linkage flagged on a board affiliation",
    summary:
      "A newly appointed board affiliate matches a politically-exposed-person record. Low severity given the indirect relationship.",
    severity: "Low",
    confidence: 0.58,
    detected: "11h ago",
    affectedClientIds: [7], // Nestle
  },
  {
    id: "evt-evergrande-winding-up",
    source: "Corporate Registry & Ownership",
    provider: "HK Companies Registry",
    headline: "Winding-up order issued; liquidators appointed",
    summary:
      "A court winding-up order was filed and liquidators are seizing overseas assets. Material change to the entity's solvency and control structure.",
    severity: "Critical",
    confidence: 0.95,
    detected: "30m ago",
    affectedClientIds: [3], // Evergrande Group
  },
  {
    id: "evt-wirecard-ubo",
    source: "Corporate Registry & Ownership",
    provider: "OpenCorporates",
    headline: "Beneficial-owner discrepancy filed against estate entity",
    summary:
      "Registry update shows a previously undisclosed beneficial owner inconsistent with the onboarded ownership profile.",
    severity: "High",
    confidence: 0.71,
    detected: "6h ago",
    affectedClientIds: [12], // Wirecard
  },
  {
    id: "evt-lindenhof-shell-funding",
    source: "Funding & Startup Intelligence",
    provider: "Crunchbase · PitchBook",
    headline: "Holding entity linked to a newly funded shell vehicle",
    summary:
      "A freshly incorporated vehicle that raised undisclosed capital shares directors with the monitored holding company — consistent with the dormancy-break pattern already on file.",
    severity: "High",
    confidence: 0.66,
    detected: "5h ago",
    affectedClientIds: [6], // Lindenhof Holdings AG
  },
  {
    id: "evt-orion-domain-spoof",
    source: "Website & Domain Monitoring",
    provider: "WHOIS · SecurityTrails",
    headline: "14 look-alike domains registered overnight",
    summary:
      "A burst of typosquatting domains mimicking the entity's brand was registered within hours from the same registrar — a possible precursor to phishing or trade-based fraud.",
    severity: "Medium",
    confidence: 0.69,
    detected: "3h ago",
    affectedClientIds: [9], // Orion Bay Trading FZE
  },
]

// Resolve client ids to records once, so consumers can render names/sectors
// without re-walking data.json.
const CLIENTS_BY_ID = new Map<number, ClientRecord>(
  (data as ClientRecord[]).map((c) => [c.id, c])
)

export function clientsForEvent(event: RiskEvent): ClientRecord[] {
  return event.affectedClientIds
    .map((id) => CLIENTS_BY_ID.get(id))
    .filter((c): c is ClientRecord => Boolean(c))
}

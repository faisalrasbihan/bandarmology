"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowDownLeftIcon,
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ShieldAlertIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { formatMoney } from "@/lib/format"
import { SeverityBadge } from "@/components/risk-badges"
import { logAudit } from "@/lib/audit-log"

type Plane = "internal" | "onchain"
type AmlStatus = "proposed" | "confirmed" | "escalated" | "dismissed"

interface InvestigationFinding {
  id: string
  flagType: string
  label: string
  severity: "low" | "medium" | "high" | "critical"
  confidence: number
  rationale: string
  recommendedAction: string
  narrative: string | null
  status: AmlStatus
  evidenceCount: number
  metrics: Record<string, number | string>
}

interface FlowCluster {
  plane: Plane
  label: string
  direction: "inbound" | "outbound" | "mixed"
  totalUsd: number
  count: number
  highRisk: boolean
}

interface TimelineEvent {
  plane: Plane
  id: string
  ts: string
  direction: "inbound" | "outbound"
  amountUsd: number
  counterparty: string
  detail: string
  evidence: boolean
  highRisk: boolean
}

export interface InvestigationData {
  entityName: string
  hasActivity: boolean
  severity: "low" | "medium" | "high" | "critical" | null
  window: { from: string; to: string; days: number } | null
  findings: InvestigationFinding[]
  flows: FlowCluster[]
  evidence: TimelineEvent[]
  timeline: TimelineEvent[]
  ledger: {
    internalCount: number
    onchainCount: number
    internalTotalUsd: number
    onchainTotalUsd: number
    windowInternalCount: number
    windowOnchainCount: number
  }
  addresses: { chain: string; address: string }[]
  narrative: string | null
  narrativeConfidence?: number
}

const TIMELINE_PREVIEW = 8

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtDate(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Where a risk officer can route a confirmed finding.
const ESCALATION_TARGETS = [
  "Compliance review",
  "AML investigation (SAR)",
  "MLRO / senior management",
]

const STATUS_VARIANT: Record<AmlStatus, "secondary" | "default" | "destructive" | "outline"> = {
  proposed: "secondary",
  confirmed: "default",
  escalated: "destructive",
  dismissed: "outline",
}

export function InvestigationView({
  clientId,
  entityName,
  severityHint,
  initialData,
}: {
  clientId: number
  entityName: string
  severityHint?: string
  /**
   * The investigation view snapshotted into src/app/investigations.json at
   * build time. When present, the page renders entirely from this static data
   * and never calls the live API — so it works in any deployment without a DB.
   * The live fetch below is only a dev fallback for entities not in the snapshot.
   */
  initialData?: InvestigationData
}) {
  const [view, setView] = useState<InvestigationData | null>(initialData ?? null)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [timelineExpanded, setTimelineExpanded] = useState(false)
  const [ledgerExpanded, setLedgerExpanded] = useState(false)
  // Human-in-the-loop: findings stay "proposed" until the analyst acts here.
  // The decision is recorded in the Audit Log and reflected locally.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, AmlStatus>>({})
  const router = useRouter()

  // Seamless "Back": return to wherever the analyst came from (usually the
  // Investigations list), falling back to that list on a direct deep-link.
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push("/investigation")
    }
  }

  function actOnFinding(
    finding: InvestigationFinding,
    decision: "Escalated" | "Acknowledged",
    destination?: string
  ) {
    setStatusOverrides((prev) => ({
      ...prev,
      [finding.id]: decision === "Escalated" ? "escalated" : "dismissed",
    }))
    logAudit({
      action: decision,
      entity: entityName,
      clientId,
      severity: finding.severity,
      detail: destination
        ? `${finding.label} → ${destination}: ${finding.rationale}`
        : `${finding.label}: ${finding.rationale}`,
      source: "Investigation",
    })
    toast.success(
      decision === "Escalated"
        ? `Escalated to ${destination}: ${finding.label}`
        : `Acknowledged: ${finding.label}`,
      { description: "Recorded in the Audit Log." }
    )
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/investigation/${encodeURIComponent(entityName)}`)
      if (!res.ok) {
        setError("Live investigation data is unavailable for this client.")
        return
      }
      const data = await res.json()
      setView(data)
      setError(null)
    } catch {
      setError("Live investigation data is unavailable for this client.")
    } finally {
      setLoading(false)
    }
  }, [entityName])

  useEffect(() => {
    // Static snapshot already supplied — no live call needed (works without a DB).
    if (initialData) return
    // load() only setStates after `await`, so there's no cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load, initialData])

  const maxFlow = view ? Math.max(1, ...view.flows.map((f) => f.totalUsd)) : 1
  const visibleTimeline = view
    ? timelineExpanded
      ? view.timeline
      : view.timeline.slice(0, TIMELINE_PREVIEW)
    : []

  return (
    <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={goBack}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{entityName}</h1>
            {view?.severity ? (
              <SeverityBadge severity={cap(view.severity)} />
            ) : (
              severityHint && <SeverityBadge severity={severityHint} />
            )}
          </div>
          {view?.window && (
            <p className="text-muted-foreground text-sm">
              Anomaly window: {fmtDate(view.window.from)} → {fmtDate(view.window.to)} ({view.window.days}d)
            </p>
          )}
          {view && view.addresses.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {view.addresses.map((a) => (
                <Badge key={a.address} variant="outline" className="font-mono text-xs font-normal">
                  {a.chain}: {a.address.slice(0, 10)}…{a.address.slice(-4)}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      {view && !view.hasActivity && (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            No internal bank transactions or known public-ledger activity for {entityName}. This
            client has no transaction-level investigation surface — the risk signal driving its
            severity comes from public news/KYC drift instead (see the client profile).
          </CardContent>
        </Card>
      )}

      {view?.hasActivity && (
        <>
          {/* 1. Findings — lead with the pattern, not the ledger */}
          <Card>
            <CardHeader>
              <CardTitle>Findings</CardTitle>
              <CardDescription>Internal AML monitoring (Layer 2)</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {view.findings.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No AML findings fired. Activity below is shown for context only.
                </p>
              )}
              {view.findings.map((f) => {
                const status = statusOverrides[f.id] ?? f.status
                const acted = status !== "proposed"
                return (
                  <div key={f.id} className="flex flex-col gap-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{f.label}</span>
                      <SeverityBadge severity={cap(f.severity)} />
                      <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
                      <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                        confidence {(f.confidence * 100).toFixed(0)}% · {f.evidenceCount} evidence tx
                      </span>
                    </div>
                    <p className="text-sm">{f.rationale}</p>
                    <p className="text-muted-foreground text-xs">
                      <span className="font-medium">Recommended:</span> {f.recommendedAction}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 border-t pt-2">
                      {acted ? (
                        <span className="text-muted-foreground text-xs">
                          You {status === "escalated" ? "escalated" : "acknowledged"} this finding —
                          see the Audit Log.
                        </span>
                      ) : (
                        <>
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button size="sm" variant="destructive" />}>
                              <ShieldAlertIcon data-icon="inline-start" />
                              Escalate
                              <ChevronDownIcon data-icon="inline-end" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuGroup>
                                <DropdownMenuLabel>Escalate to</DropdownMenuLabel>
                                {ESCALATION_TARGETS.map((t) => (
                                  <DropdownMenuItem key={t} onClick={() => actOnFinding(f, "Escalated", t)}>
                                    {t}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => actOnFinding(f, "Acknowledged")}
                          >
                            <CheckCircle2Icon data-icon="inline-start" />
                            Acknowledge
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* 2. Flows — the anomaly's shape, aggregated by counterparty */}
          {view.flows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Activity Shape</CardTitle>
                <CardDescription>
                  Counterparty clusters, internal (Layer 2) + on-chain (Layer 1) — sized by volume
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {view.flows.map((f, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-muted-foreground font-normal">
                        {f.plane === "onchain" ? "On-chain" : "Internal"}
                      </Badge>
                      <span className="font-medium">{f.label}</span>
                      {f.direction === "inbound" && <ArrowDownLeftIcon className="text-muted-foreground size-3.5" />}
                      {f.direction === "outbound" && <ArrowUpRightIcon className="text-muted-foreground size-3.5" />}
                      {f.highRisk && <Badge variant="destructive" className="font-normal">high-risk</Badge>}
                      <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                        {f.count} txns · {formatMoney(f.totalUsd)}
                      </span>
                    </div>
                    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full ${f.highRisk ? "bg-destructive" : "bg-chart-1"}`}
                        style={{ width: `${(f.totalUsd / maxFlow) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* 3. Evidence — only the transactions that actually triggered a finding */}
          {view.evidence.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Evidence Transactions</CardTitle>
                <CardDescription>The {view.evidence.length} transaction(s) behind the findings above</CardDescription>
              </CardHeader>
              <CardContent>
                <TxTable events={view.evidence} />
              </CardContent>
            </Card>
          )}

          {/* 4. Timeline — merged, window-scoped, capped with an explicit expand */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>
                Internal + on-chain events merged on one axis, within the anomaly window
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <TxTable events={visibleTimeline} />
              {view.timeline.length > TIMELINE_PREVIEW && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => setTimelineExpanded((v) => !v)}
                >
                  {timelineExpanded
                    ? "Show fewer"
                    : `Show all ${view.timeline.length} events in window`}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* 5. Ledger — full counts/totals, tucked away on demand */}
          <Card className="bg-muted/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Full Ledger</CardTitle>
                  <CardDescription>All-time counts, not just the anomaly window</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setLedgerExpanded((v) => !v)}>
                  {ledgerExpanded ? "Hide" : "Show"}
                </Button>
              </div>
            </CardHeader>
            {ledgerExpanded && (
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm @sm:grid-cols-4">
                  <Stat label="Internal txns" value={String(view.ledger.internalCount)} />
                  <Stat label="Internal total" value={formatMoney(view.ledger.internalTotalUsd)} />
                  <Stat label="On-chain txns" value={String(view.ledger.onchainCount)} />
                  <Stat label="On-chain total" value={formatMoney(view.ledger.onchainTotalUsd)} />
                </div>
                <Separator className="my-3" />
                <p className="text-muted-foreground text-xs">
                  {view.ledger.windowInternalCount} internal + {view.ledger.windowOnchainCount}{" "}
                  on-chain transactions fall inside the anomaly window shown above.
                </p>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

function TxTable({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-muted-foreground text-sm">No transactions in range.</p>
  }
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="p-2 font-medium">Date</th>
            <th className="p-2 font-medium">Plane</th>
            <th className="p-2 font-medium">Dir</th>
            <th className="p-2 font-medium">Amount</th>
            <th className="p-2 font-medium">Counterparty</th>
            <th className="p-2 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className={e.evidence ? "bg-destructive/5" : e.highRisk ? "bg-amber-500/5" : ""}>
              <td className="text-muted-foreground p-2 align-top whitespace-nowrap">{fmtDate(e.ts)}</td>
              <td className="p-2 align-top">
                <Badge variant="outline" className="text-muted-foreground font-normal">
                  {e.plane === "onchain" ? "On-chain" : "Internal"}
                </Badge>
              </td>
              <td className="p-2 align-top">
                {e.direction === "inbound" ? (
                  <ArrowDownLeftIcon className="size-3.5 text-emerald-600 dark:text-emerald-500" />
                ) : (
                  <ArrowUpRightIcon className="size-3.5 text-muted-foreground" />
                )}
              </td>
              <td className="p-2 align-top tabular-nums">{formatMoney(e.amountUsd)}</td>
              <td className="p-2 align-top">{e.counterparty}</td>
              <td className="p-2 align-top">
                <span className="text-muted-foreground">{e.detail}</span>
                {e.evidence && (
                  <Badge variant="destructive" className="ml-1.5 font-normal">
                    evidence
                  </Badge>
                )}
                {!e.evidence && e.highRisk && (
                  <Badge variant="outline" className="ml-1.5 border-amber-600/40 font-normal text-amber-600 dark:text-amber-500">
                    high-risk
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

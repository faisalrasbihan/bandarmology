"use client"

import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

type AlertStatus = "proposed" | "confirmed" | "escalated" | "dismissed"

interface Alert {
  id: string
  signalId: string
  entityHint: string
  flagType: string
  confidence: number
  rationale: string
  recommendedAction: string
  status: AlertStatus
  modelUsed: string
  tokenUsage: { inputTokens: number; outputTokens: number; costUsd: number }
  createdAt: string
}

interface ResolvedCitation {
  signalId: string
  source: string | null
  title: string | null
  url: string | null
  resolved: boolean
}

interface Decision {
  fromStatus: AlertStatus
  toStatus: AlertStatus
  actor: string
  note: string | null
  createdAt: string
}

interface DriftFinding {
  driftDetected: boolean
  driftType: string
  severity: "low" | "medium" | "high" | "critical"
  confidence: number
  comparison: { dimension: string; expected: string; observed: string; changed: boolean }[]
  narrative: string
  recommendedAction: string
}

interface AlertDetail extends Alert {
  resolvedCitations: ResolvedCitation[]
  decisions: Decision[]
  driftFindings: DriftFinding[]
}

interface CostSummary {
  totalAlerts: number
  totalLlmCalls: number
  totalCostUsd: number
  costPer1000Alerts: number | null
  signalsTriaged: number
  resolvedWithoutLlm: number
  passedToLlm: number
  pctResolvedWithoutLlm: number | null
}

const STATUS_VARIANT: Record<AlertStatus, "secondary" | "default" | "destructive" | "outline"> = {
  proposed: "secondary",
  confirmed: "default",
  escalated: "destructive",
  dismissed: "outline",
}

const SEVERITY_VARIANT: Record<DriftFinding["severity"], "outline" | "secondary" | "default" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
}

function fmtFlag(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export function AlertsView() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [cost, setCost] = useState<CostSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actor, setActor] = useState("analyst@amina")
  const [openId, setOpenId] = useState<string | null>(null)

  // No state is set synchronously here: the first setState happens only after
  // the fetch resolves, so this is a clean data-fetching effect (no cascading
  // renders). The refresh button sets `loading` in its own event handler.
  const load = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([
        fetch("/api/alerts").then((r) => r.json()),
        fetch("/api/cost-summary").then((r) => r.json()),
      ])
      setAlerts(a.alerts ?? [])
      setCost(c)
      setError(null)
    } catch {
      setError("Failed to load alerts. Is the dev server and database running?")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Data-fetching effect: load() only setStates after `await`, so there's no
    // cascading render. The compiler can't see through the useCallback, hence
    // the disable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <CostHeader cost={cost} />

      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Risk Alerts</h2>
        <Badge variant="outline">{alerts.length}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-muted-foreground text-sm" htmlFor="actor">
            Acting as
          </label>
          <Input
            id="actor"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            className="h-8 w-48"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true)
              void load()
            }}
          >
            Refresh
          </Button>
        </div>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {!loading && !error && alerts.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No alerts yet. Generate some with{" "}
          <code>POST /api/alerts/generate?entityHint=Wirecard</code>.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {alerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            actor={actor}
            open={openId === alert.id}
            onToggle={() => setOpenId(openId === alert.id ? null : alert.id)}
            onChanged={load}
          />
        ))}
      </div>
    </div>
  )
}

function CostHeader({ cost }: { cost: CostSummary | null }) {
  const cells = [
    { label: "Alerts", value: cost ? String(cost.totalAlerts) : "—" },
    {
      label: "Cost / 1k alerts",
      value: cost?.costPer1000Alerts != null ? `$${cost.costPer1000Alerts.toFixed(2)}` : "—",
    },
    {
      label: "Total LLM spend",
      value: cost ? `$${cost.totalCostUsd.toFixed(4)}` : "—",
    },
    {
      label: "Resolved without LLM",
      value: cost?.pctResolvedWithoutLlm != null ? `${cost.pctResolvedWithoutLlm.toFixed(1)}%` : "—",
      hint: cost ? `${cost.resolvedWithoutLlm} of ${cost.signalsTriaged} signals` : undefined,
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cells.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-2">
            <CardDescription>{c.label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{c.value}</CardTitle>
          </CardHeader>
          {c.hint && (
            <CardContent className="pt-0">
              <p className="text-muted-foreground text-xs">{c.hint}</p>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}

function AlertCard({
  alert,
  actor,
  open,
  onToggle,
  onChanged,
}: {
  alert: Alert
  actor: string
  open: boolean
  onToggle: () => void
  onChanged: () => Promise<void>
}) {
  const [detail, setDetail] = useState<AlertDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const loadDetail = useCallback(async () => {
    const d = await fetch(`/api/alerts/${alert.id}`).then((r) => r.json())
    setDetail(d)
  }, [alert.id])

  useEffect(() => {
    // loadDetail() setStates only after `await`; see note on the main load effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open && !detail) void loadDetail()
  }, [open, detail, loadDetail])

  async function changeStatus(status: AlertStatus) {
    if (!actor.trim()) {
      setMsg("Enter an actor before taking a decision.")
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, actor }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setMsg(e.error ?? "Action failed")
      } else {
        await loadDetail()
        await onChanged()
      }
    } finally {
      setBusy(false)
    }
  }

  async function analyze() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/alerts/${alert.id}/analyze`, { method: "POST" })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setMsg(e.error ?? "Drift analysis failed")
      } else {
        await loadDetail()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{alert.entityHint}</CardTitle>
          <Badge variant="outline">{fmtFlag(alert.flagType)}</Badge>
          <Badge variant={STATUS_VARIANT[alert.status]}>{alert.status}</Badge>
          <span className="text-muted-foreground text-xs tabular-nums">
            confidence {(alert.confidence * 100).toFixed(0)}%
          </span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onToggle}>
            {open ? "Hide" : "Details"}
          </Button>
        </div>
        <CardDescription className="pt-1">{alert.rationale}</CardDescription>
      </CardHeader>

      {open && (
        <CardContent className="flex flex-col gap-4">
          <Separator />
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Recommended action</p>
            <p className="text-sm">{alert.recommendedAction}</p>
          </div>

          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
              Sources (grounding)
            </p>
            {detail ? (
              <ul className="flex flex-col gap-1 text-sm">
                {detail.resolvedCitations.map((c) => (
                  <li key={c.signalId}>
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {c.title ?? c.url}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Unresolved citation ({c.signalId})</span>
                    )}
                    {c.source && <span className="text-muted-foreground"> — {c.source}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Loading…</p>
            )}
          </div>

          {detail && detail.driftFindings.length > 0 && (
            <DriftPanel finding={detail.driftFindings[0]} />
          )}

          {detail && detail.decisions.length > 0 && (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Decision history</p>
              <ul className="flex flex-col gap-1 text-sm">
                {detail.decisions.map((d, i) => (
                  <li key={i} className="text-muted-foreground">
                    {new Date(d.createdAt).toLocaleString()} — <span className="text-foreground">{d.actor}</span>{" "}
                    moved {d.fromStatus} → {d.toStatus}
                    {d.note ? ` (“${d.note}”)` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Separator />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => changeStatus("confirmed")}>
              Confirm
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => changeStatus("escalated")}>
              Escalate
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus("dismissed")}>
              Dismiss
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={analyze}>
              Analyze drift (Stage 3)
            </Button>
            <span className="text-muted-foreground ml-auto text-xs">
              {alert.modelUsed} · ${alert.tokenUsage.costUsd.toFixed(4)}
            </span>
          </div>
          {msg && <p className="text-destructive text-sm">{msg}</p>}
        </CardContent>
      )}
    </Card>
  )
}

function DriftPanel({ finding }: { finding: DriftFinding }) {
  return (
    <div className="bg-muted/40 rounded-lg border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">KYC Drift (Stage 3)</span>
        <Badge variant={SEVERITY_VARIANT[finding.severity]}>{finding.severity}</Badge>
        <Badge variant="outline">{fmtFlag(finding.driftType)}</Badge>
        <span className="text-muted-foreground text-xs tabular-nums">
          confidence {(finding.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <p className="mb-3 text-sm">{finding.narrative}</p>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="p-2 font-medium">Dimension</th>
              <th className="p-2 font-medium">Onboarded</th>
              <th className="p-2 font-medium">Observed</th>
            </tr>
          </thead>
          <tbody>
            {finding.comparison.map((c, i) => (
              <tr key={i} className={c.changed ? "bg-destructive/5" : ""}>
                <td className="p-2 align-top font-medium">{fmtFlag(c.dimension)}</td>
                <td className="text-muted-foreground p-2 align-top">{c.expected}</td>
                <td className="p-2 align-top">{c.observed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

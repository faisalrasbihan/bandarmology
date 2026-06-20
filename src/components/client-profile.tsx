import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { RiskDriftChart, type ChartSignal } from "@/components/risk-drift-chart"
import { EscalateDialog } from "@/components/escalate-dialog"
import { RekycDialog } from "@/components/rekyc-dialog"
import { exposureAtRisk, formatMoney } from "@/lib/format"
import {
  initials,
  RiskDrift,
  RiskStatusBadge,
  SeverityBadge,
  StatusBadge,
} from "@/components/risk-badges"

export interface ClientRecord {
  id: number
  client: string
  sector: string
  jurisdiction: string
  relationship: string
  flagged: boolean
  exposureUsd: number
  severity: string
  originalRisk: string
  currentRisk: string
  riskScore: number
  riskDelta: number
  signal: string
  trigger: string
  sources: number
  detected: string
  status: string
  kyc: {
    onboarded: string
    expectedModel: string
    expectedActivity: string
    owners: string
  }
  baseline: string
  observed: string
  reasoning: string
  confidence: number
  tier: string
  action: string
  summary: string
  riskBreakdown: { type: string; status: string; reason: string }[]
  citations: { source: string; date: string; headline: string }[]
  watchlist?: boolean
  watchlistMeta?: {
    reason: string
    addedBy: string
    addedOn: string
    reviewBy: string
  }
}

// Decompose the risk score into weighted, additive contributors that sum to
// the score — so the reader can see how the read produces the number.
function scoreFactors(c: ClientRecord) {
  const base = ({ Low: 20, Medium: 30, High: 40 } as Record<string, number>)[c.originalRisk] ?? 30
  const sev = ({ Critical: 28, High: 20, Medium: 12, Low: 5 } as Record<string, number>)[c.severity] ?? 10
  const corrob = Math.min(c.sources * 3, 15)
  const drift = Math.max(0, c.riskScore - (base + sev + corrob))
  return [
    { label: "Onboarding baseline", points: base },
    { label: "Signal severity", points: sev },
    { label: "Source corroboration", points: corrob },
    { label: "Drift & contextual factors", points: drift },
  ]
}

// Turn the client's source citations into chart signals. The most recent
// citation is the live trigger (rendered as a fresh "new" marker and carrying
// the full Detected-Change detail); earlier ones are treated as already
// followed-up corroboration.
function buildSignals(c: ClientRecord): ChartSignal[] {
  const sorted = [...c.citations].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((cit, i) => {
    const isLatest = i === sorted.length - 1
    return {
      id: `${c.id}-${i}`,
      date: cit.date,
      source: cit.source,
      headline: cit.headline,
      signalLabel: isLatest ? c.signal : cit.source,
      observed: isLatest ? c.observed : cit.headline,
      reasoning: isLatest
        ? c.reasoning
        : `Picked up from ${cit.source}. Corroborates the emerging ${c.signal.toLowerCase()} pattern against the onboarding baseline.`,
      followedUp: !isLatest,
    }
  })
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  )
}

export function ClientProfile({ client }: { client: ClientRecord }) {
  const signals = buildSignals(client)
  const timeline = [
    {
      date: client.kyc.onboarded,
      title: "Client onboarded",
      desc: `Baseline risk ${client.originalRisk}. ${client.kyc.expectedModel}.`,
      kind: "baseline" as const,
    },
    ...[...client.citations]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((c) => ({
        date: c.date,
        title: `${c.source}: signal picked up`,
        desc: c.headline,
        kind: "signal" as const,
      })),
    {
      date: "Now",
      title: `Risk reclassified: ${client.originalRisk} → ${client.currentRisk}`,
      desc: client.trigger,
      kind: "alert" as const,
    },
  ]

  const dotClass = {
    baseline: "bg-muted-foreground",
    signal: "bg-sky-500",
    alert: "bg-red-600 dark:bg-red-500",
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          className="text-muted-foreground"
          render={<Link href="/" />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back to dashboard
        </Button>
      </div>

      {/* Identity header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="size-16 shrink-0">
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-foreground">
              {initials(client.client)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold">{client.client}</h1>
            <p className="text-sm text-muted-foreground">
              {client.sector} · {client.jurisdiction}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={client.severity} />
              <StatusBadge status={client.status} />
              <Badge variant="secondary" className="font-normal">
                {client.relationship}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="flex flex-col sm:items-end">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Exposure
            </span>
            <span className="text-xl font-semibold tabular-nums">
              {formatMoney(client.exposureUsd)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatMoney(exposureAtRisk(client.exposureUsd, client.riskScore))} at risk
            </span>
          </div>
          <div className="flex items-center gap-2">
            <EscalateDialog
              client={client.client}
              defaultAction={client.action}
              trigger={<Button variant="outline">Escalate</Button>}
            />
            <RekycDialog client={client.client} />
          </div>
        </div>
      </div>

      {/* Risk trend + assessment */}
      <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-3">
        <Card className="h-full @4xl/main:col-span-2 @4xl/main:h-[340px]">
          <CardHeader>
            <CardTitle>Risk Score Trend</CardTitle>
            <CardDescription>
              12-month drift against the onboarding baseline
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <RiskDriftChart
              originalRisk={client.originalRisk}
              currentScore={client.riskScore}
              signals={client.originalRisk !== client.currentRisk ? signals : []}
              clientName={client.client}
              defaultAction={client.action}
            />
          </CardContent>
          <CardFooter className="gap-2 border-t pt-4 text-sm">
            <RiskDrift from={client.originalRisk} to={client.currentRisk} />
            <span className="text-muted-foreground">
              now {client.riskScore}/100 (+{client.riskDelta} this week)
            </span>
          </CardFooter>
        </Card>

        <Card className="h-full @4xl/main:h-[340px]">
          <CardHeader>
            <CardTitle>Risk Summary</CardTitle>
            <CardDescription>How this reads as {client.riskScore}/100</CardDescription>
          </CardHeader>
          <Tabs
            defaultValue="narrative"
            className="flex min-h-0 flex-1 flex-col gap-3 px-(--card-spacing)"
          >
            <TabsList className="w-full">
              <TabsTrigger value="narrative" className="flex-1">
                Narrative
              </TabsTrigger>
              <TabsTrigger value="contributors" className="flex-1">
                Score
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="narrative"
              className="min-h-0 flex-1 overflow-y-auto pr-1 text-sm leading-relaxed text-muted-foreground"
            >
              {client.summary}
            </TabsContent>
            <TabsContent
              value="contributors"
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 text-sm"
            >
              <div className="flex flex-col gap-2.5">
                {scoreFactors(client).map((f) => (
                  <div key={f.label} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span>{f.label}</span>
                      <span className="tabular-nums text-muted-foreground">+{f.points}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-1"
                        style={{ width: `${(f.points / client.riskScore) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t pt-2 text-xs font-medium">
                <span>Total score</span>
                <span className="tabular-nums">{client.riskScore}/100</span>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <span>Confidence {Math.round(client.confidence * 100)}%</span>
                <span>Tier {client.tier}</span>
                <span>{client.sources} sources</span>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* KYC baseline + risk breakdown */}
      <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>KYC Baseline</CardTitle>
            <CardDescription>Layer 2 — internal onboarding profile</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Fact label="Onboarded" value={client.kyc.onboarded} />
            <Fact label="Original rating" value={client.originalRisk} />
            <Fact label="Expected model" value={client.kyc.expectedModel} />
            <Fact label="Expected activity" value={client.kyc.expectedActivity} />
            <Fact label="Beneficial owners" value={client.kyc.owners} />
            <Fact label="Relationship" value={client.relationship} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk Breakdown</CardTitle>
            <CardDescription>
              Contextual to the {client.relationship.toLowerCase()} relationship
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3">
            {client.riskBreakdown.map((r, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.type}</span>
                  <RiskStatusBadge status={r.status} />
                </div>
                <span className="text-xs text-muted-foreground">{r.reason}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Activity timeline + sources */}
      <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-3">
        <Card className="@3xl/main:col-span-2">
          <CardHeader>
            <CardTitle>Activity Timeline</CardTitle>
            <CardDescription>From onboarding to current drift</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col">
              {timeline.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dotClass[e.kind]}`} />
                    {i < timeline.length - 1 && (
                      <span className="w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 pb-5">
                    <span className="text-xs text-muted-foreground">{e.date}</span>
                    <span className="text-sm font-medium">{e.title}</span>
                    <span className="text-sm text-muted-foreground">{e.desc}</span>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
            <CardDescription>{client.sources} citations</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {client.citations.map((c, i) => (
                <li key={i} className="flex flex-col">
                  <span>{c.headline}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.source} · {c.date}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

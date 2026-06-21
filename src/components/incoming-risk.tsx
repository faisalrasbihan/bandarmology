"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRightIcon, CheckCircle2Icon, LayoutGridIcon, TableIcon, UsersIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SeverityBadge } from "@/components/risk-badges"
import {
  RISK_EVENTS,
  SOURCE_ORDER,
  clientsForEvent,
  type RiskEvent,
  type RiskSource,
} from "@/lib/risk-events"
import {
  markEvent,
  setCaseStage,
  useCasesByEvent,
  STAGE_META,
  type CaseRecord,
  type CaseStage,
} from "@/lib/case-stages"

// Each stage can be advanced to exactly one next stage; "closed" is terminal.
const NEXT_STAGE: Record<CaseStage, CaseStage | null> = {
  marked: "investigation",
  investigation: "escalated",
  escalated: "closed",
  closed: null,
}

const STAGE_BADGE_CLASS: Record<CaseStage, string> = {
  marked: "border-sky-500/40 text-sky-600 dark:text-sky-400",
  investigation: "border-amber-600/40 text-amber-600 dark:text-amber-500",
  escalated: "border-red-600/40 text-red-600 dark:text-red-500",
  closed: "text-muted-foreground",
}

// Short, colour-coded identifier for each public source — shown on every card /
// row so the queue reads as one flat list rather than being split by source.
const SOURCE_META: Record<RiskSource, { label: string; cls: string }> = {
  "News & Adverse Media": { label: "News", cls: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  "Sanctions & Watchlists": { label: "Sanctions", cls: "border-red-600/40 text-red-600 dark:text-red-500" },
  "Corporate Registry & Ownership": { label: "Registry", cls: "border-violet-500/40 text-violet-600 dark:text-violet-400" },
  "Funding & Startup Intelligence": { label: "Funding", cls: "border-emerald-500/40 text-emerald-600 dark:text-emerald-500" },
  "Website & Domain Monitoring": { label: "Domain", cls: "border-amber-600/40 text-amber-600 dark:text-amber-500" },
  "Social Media": { label: "Social", cls: "border-pink-500/40 text-pink-600 dark:text-pink-400" },
}

const SEV_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 }
const SEVERITIES = ["Critical", "High", "Medium", "Low"]

// Source tag — clickable when `onClick` is given, so it doubles as a filter
// control both in the toolbar and on each card/row.
function SourceBadge({
  source,
  onClick,
  active,
}: {
  source: RiskSource
  onClick?: () => void
  active?: boolean
}) {
  const m = SOURCE_META[source]
  const badge = (
    <Badge variant="outline" className={`${m.cls} ${active ? "ring-2 ring-current/30" : ""}`}>
      {m.label}
    </Badge>
  )
  if (!onClick) return badge
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="cursor-pointer rounded-full"
      aria-pressed={active}
    >
      {badge}
    </button>
  )
}

// Severity tag, clickable as a filter (wraps the shared SeverityBadge).
function SeverityChip({
  severity,
  onClick,
  active,
}: {
  severity: string
  onClick?: () => void
  active?: boolean
}) {
  const inner = (
    <span className={active ? "rounded-md ring-2 ring-primary/40" : ""}>
      <SeverityBadge severity={severity} />
    </span>
  )
  if (!onClick) return inner
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="cursor-pointer"
      aria-pressed={active}
    >
      {inner}
    </button>
  )
}

function StageBadge({ stage }: { stage: CaseStage }) {
  return (
    <Badge variant="outline" className={STAGE_BADGE_CLASS[stage]}>
      {stage === "closed" && (
        <CheckCircle2Icon className="size-3 fill-green-500/20 text-green-600 dark:text-green-400" />
      )}
      {STAGE_META[stage].label}
    </Badge>
  )
}

function distinctStages(cases: CaseRecord[]): CaseStage[] {
  return [...new Set(cases.map((c) => c.stage))]
}

// One affected-client row inside a marked event: shows the case's current stage
// and the single human action that advances it down the funnel.
function CaseRow({ rec }: { rec: CaseRecord }) {
  const next = NEXT_STAGE[rec.stage]
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1">
      <Link
        href={`/clients/${rec.clientId}`}
        className="text-sm font-medium underline-offset-4 hover:underline"
      >
        {rec.clientName}
      </Link>
      <div className="flex items-center gap-2">
        <StageBadge stage={rec.stage} />
        {next && (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => setCaseStage(rec.caseId, next)}
          >
            {next === "closed" ? "Close case" : `Move to ${STAGE_META[next].label}`}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        )}
      </div>
    </div>
  )
}

function EventCard({
  event,
  cases,
  onToggleSource,
  onToggleSeverity,
}: {
  event: RiskEvent
  cases: CaseRecord[]
  onToggleSource: (s: RiskSource) => void
  onToggleSeverity: (s: string) => void
}) {
  const affected = clientsForEvent(event)
  const marked = cases.length > 0
  const caseById = new Map(cases.map((c) => [c.clientId, c]))

  return (
    <Card className="gap-3">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source={event.source} onClick={() => onToggleSource(event.source)} />
          <SeverityChip severity={event.severity} onClick={() => onToggleSeverity(event.severity)} />
          <Badge variant="secondary" className="font-normal">
            {event.provider}
          </Badge>
          <span className="text-xs tabular-nums text-muted-foreground">
            {(event.confidence * 100).toFixed(0)}% confidence
          </span>
          <span className="ml-auto text-xs text-muted-foreground">{event.detected}</span>
        </div>
        <p className="text-sm font-semibold">{event.headline}</p>
        <p className="text-sm text-muted-foreground">{event.summary}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <Separator />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UsersIcon className="size-3.5" />
          {affected.length} affected {affected.length === 1 ? "client" : "clients"}
        </div>

        {!marked ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {affected.map((c) => (
                <Link
                  key={c.id}
                  href={`/clients/${c.id}`}
                  className="rounded-md border px-2 py-0.5 text-xs font-medium underline-offset-4 hover:border-primary/40"
                >
                  {c.client}
                </Link>
              ))}
            </div>
            <Button size="sm" onClick={() => markEvent(event, affected)}>
              Mark for review
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col divide-y">
            {affected.map((c) => {
              const rec = caseById.get(c.id)
              return rec ? (
                <CaseRow key={c.id} rec={rec} />
              ) : (
                <div key={c.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm font-medium">{c.client}</span>
                  <Button variant="outline" size="sm" className="h-7" onClick={() => markEvent(event, [c])}>
                    Mark
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EventTableRow({
  event,
  cases,
  onToggleSource,
  onToggleSeverity,
}: {
  event: RiskEvent
  cases: CaseRecord[]
  onToggleSource: (s: RiskSource) => void
  onToggleSeverity: (s: string) => void
}) {
  const affected = clientsForEvent(event)
  const marked = cases.length > 0
  return (
    <tr className="border-t align-top">
      <td className="p-2">
        <SourceBadge source={event.source} onClick={() => onToggleSource(event.source)} />
      </td>
      <td className="p-2">
        <SeverityChip severity={event.severity} onClick={() => onToggleSeverity(event.severity)} />
      </td>
      <td className="max-w-[28rem] p-2">
        <div className="font-medium">{event.headline}</div>
        <div className="text-xs text-muted-foreground">
          {event.provider} · {event.detected}
        </div>
      </td>
      <td className="p-2 tabular-nums">{(event.confidence * 100).toFixed(0)}%</td>
      <td className="p-2">
        <div className="flex flex-wrap gap-1">
          {affected.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="text-xs underline-offset-4 hover:underline"
            >
              {c.client}
            </Link>
          ))}
        </div>
      </td>
      <td className="p-2">
        {marked ? (
          <div className="flex flex-wrap gap-1">
            {distinctStages(cases).map((s) => (
              <StageBadge key={s} stage={s} />
            ))}
          </div>
        ) : (
          <Button size="sm" className="h-7" onClick={() => markEvent(event, affected)}>
            Mark
          </Button>
        )}
      </td>
    </tr>
  )
}

function EventTable({
  events,
  casesByEvent,
  onToggleSource,
  onToggleSeverity,
}: {
  events: RiskEvent[]
  casesByEvent: Map<string, CaseRecord[]>
  onToggleSource: (s: RiskSource) => void
  onToggleSeverity: (s: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th className="p-2 font-medium">Source</th>
            <th className="p-2 font-medium">Severity</th>
            <th className="p-2 font-medium">Event</th>
            <th className="p-2 font-medium">Conf.</th>
            <th className="p-2 font-medium">Affected</th>
            <th className="p-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <EventTableRow
              key={e.id}
              event={e}
              cases={casesByEvent.get(e.id) ?? []}
              onToggleSource={onToggleSource}
              onToggleSeverity={onToggleSeverity}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function IncomingRisk() {
  const casesByEvent = useCasesByEvent()
  const [view, setView] = React.useState<"cards" | "table">("cards")
  const [sources, setSources] = React.useState<Set<RiskSource>>(new Set())
  const [severities, setSeverities] = React.useState<Set<string>>(new Set())

  const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  const toggleSource = (s: RiskSource) => toggle(setSources, s)
  const toggleSeverity = (s: string) => toggle(setSeverities, s)
  const clearFilters = () => {
    setSources(new Set())
    setSeverities(new Set())
  }
  const filtersActive = sources.size > 0 || severities.size > 0

  // Flat list across all sources, highest-severity first (then confidence),
  // narrowed by the active source / severity tag filters.
  const events = React.useMemo(
    () =>
      [...RISK_EVENTS]
        .filter((e) => (sources.size === 0 || sources.has(e.source)) && (severities.size === 0 || severities.has(e.severity)))
        .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.confidence - a.confidence),
    [sources, severities]
  )

  return (
    <div id="incoming-risk" className="flex scroll-mt-20 flex-col gap-4 px-4 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold">Risk Incoming</h2>
          <p className="text-sm text-muted-foreground">
            Public events across every source. Click any tag to filter; mark an event to open a
            case per affected client.
          </p>
        </div>
        <ToggleGroup
          multiple={false}
          value={[view]}
          onValueChange={(v) => setView((v[0] as "cards" | "table") ?? "cards")}
          variant="outline"
          className="*:data-[slot=toggle-group-item]:px-3!"
        >
          <ToggleGroupItem value="cards" className="gap-1.5">
            <LayoutGridIcon className="size-4" />
            Cards
          </ToggleGroupItem>
          <ToggleGroupItem value="table" className="gap-1.5">
            <TableIcon className="size-4" />
            Table
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Clickable tag filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-xs text-muted-foreground">Filter:</span>
        {SOURCE_ORDER.map((s) => (
          <SourceBadge key={s} source={s} onClick={() => toggleSource(s)} active={sources.has(s)} />
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {SEVERITIES.map((s) => (
          <SeverityChip key={s} severity={s} onClick={() => toggleSeverity(s)} active={severities.has(s)} />
        ))}
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Clear ({events.length})
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          No events match the selected tags.
        </p>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 @3xl/main:grid-cols-2">
          {events.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              cases={casesByEvent.get(e.id) ?? []}
              onToggleSource={toggleSource}
              onToggleSeverity={toggleSeverity}
            />
          ))}
        </div>
      ) : (
        <EventTable
          events={events}
          casesByEvent={casesByEvent}
          onToggleSource={toggleSource}
          onToggleSeverity={toggleSeverity}
        />
      )}
    </div>
  )
}

"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRightIcon, CheckCircle2Icon, UsersIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
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
}: {
  event: RiskEvent
  cases: CaseRecord[]
}) {
  const affected = clientsForEvent(event)
  const marked = cases.length > 0
  // Map each affected client to its case (clients may have been marked in any order).
  const caseById = new Map(cases.map((c) => [c.clientId, c]))

  return (
    <Card className="gap-3">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-normal">
            {event.provider}
          </Badge>
          <SeverityBadge severity={event.severity} />
          <span className="text-xs tabular-nums text-muted-foreground">
            {(event.confidence * 100).toFixed(0)}% confidence
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {event.detected}
          </span>
        </div>
        <p className="text-sm font-semibold">{event.headline}</p>
        <p className="text-sm text-muted-foreground">{event.summary}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <Separator />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UsersIcon className="size-3.5" />
          {affected.length} affected{" "}
          {affected.length === 1 ? "client" : "clients"}
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
            <Button
              size="sm"
              onClick={() => markEvent(event, affected)}
            >
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
                // Edge case: a client added to the event after it was marked.
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 py-1"
                >
                  <span className="text-sm font-medium">{c.client}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => markEvent(event, [c])}
                  >
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

export function IncomingRisk() {
  const casesByEvent = useCasesByEvent()

  // Group the events by their public source, preserving the canonical order.
  const grouped = React.useMemo(() => {
    const map = new Map<RiskSource, RiskEvent[]>()
    for (const source of SOURCE_ORDER) map.set(source, [])
    for (const e of RISK_EVENTS) map.get(e.source)?.push(e)
    return SOURCE_ORDER.map((source) => ({
      source,
      events: map.get(source) ?? [],
    })).filter((g) => g.events.length > 0)
  }, [])

  return (
    <div id="incoming-risk" className="flex scroll-mt-20 flex-col gap-4 px-4 lg:px-6">
      <div className="flex flex-col">
        <h2 className="text-base font-semibold">Risk Incoming</h2>
        <p className="text-sm text-muted-foreground">
          Public events grouped by source. Marking an event opens a case for each
          affected client and moves it into the pipeline.
        </p>
      </div>

      {grouped.map(({ source, events }) => (
        <div key={source} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{source}</h3>
            <Badge variant="outline" className="text-muted-foreground">
              {events.length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 @3xl/main:grid-cols-2">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                cases={casesByEvent.get(event.id) ?? []}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

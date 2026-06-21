"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronRightIcon, SearchIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { FeedEvent, Pipeline } from "@/lib/alert-feed"

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function fmtDate(ts: string) {
  const [, m, d] = ts.split("-")
  return `${MON[Number(m) - 1]} ${Number(d)}`
}

function TierBadge({ tier }: { tier: string }) {
  const cls =
    tier === "Deep"
      ? "border-violet-500/40 text-violet-600 dark:text-violet-400"
      : tier === "LLM"
        ? "border-sky-500/40 text-sky-600 dark:text-sky-400"
        : "text-muted-foreground"
  return (
    <Badge variant="outline" className={cls}>
      {tier}
    </Badge>
  )
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "Alert raised") {
    return (
      <Badge variant="outline" className="border-red-600/40 text-red-600 dark:text-red-500">
        Alert raised
      </Badge>
    )
  }
  if (outcome === "Supporting signal") {
    return <Badge variant="secondary">Supporting</Badge>
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {outcome.startsWith("Filtered") ? "Filtered" : outcome}
    </Badge>
  )
}

function FunnelStage({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub: string
  accent?: boolean
}) {
  return (
    <div
      className={`flex min-w-[120px] flex-1 flex-col gap-0.5 rounded-lg border px-4 py-3 ${
        accent ? "border-red-600/30 bg-red-600/5" : ""
      }`}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  )
}

function Arrow() {
  return (
    <div className="hidden items-center text-muted-foreground sm:flex">
      <ChevronRightIcon className="size-4" />
    </div>
  )
}

export function AlertsFeed({
  events,
  pipeline,
}: {
  events: FeedEvent[]
  pipeline: Pipeline
}) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [source, setSource] = React.useState("all")
  const [tier, setTier] = React.useState("all")
  const [outcome, setOutcome] = React.useState("all")

  const sources = React.useMemo(
    () => Array.from(new Set(events.map((e) => e.source))).sort(),
    [events]
  )

  const filtered = events.filter((e) => {
    const q = query.toLowerCase()
    const matchesQuery =
      !q ||
      e.headline.toLowerCase().includes(q) ||
      (e.clientName?.toLowerCase().includes(q) ?? false)
    const matchesSource = source === "all" || e.source === source
    const matchesTier = tier === "all" || e.tier === tier
    const matchesOutcome =
      outcome === "all" ||
      (outcome === "Filtered"
        ? e.outcome.startsWith("Filtered")
        : e.outcome === outcome)
    return matchesQuery && matchesSource && matchesTier && matchesOutcome
  })

  return (
    <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Alerts — Intelligence Feed</h1>
        <p className="text-sm text-muted-foreground">
          Time-ordered log of every public signal the engine ingested, with full provenance
          and the pipeline stage that processed it.
        </p>
      </div>

      {/* Pipeline funnel + cost */}
      <div className="flex flex-wrap items-stretch gap-2">
        <FunnelStage label="Ingested" value={pipeline.ingested.toLocaleString()} sub="signals, last 7 days" />
        <Arrow />
        <FunnelStage label="Cheap filter" value={pipeline.kept.toLocaleString()} sub="kept (rules + embeddings)" />
        <Arrow />
        <FunnelStage label="LLM reasoning" value={pipeline.llm.toLocaleString()} sub="escalated to stage 2" />
        <Arrow />
        <FunnelStage label="Alerts raised" value={pipeline.alerts.toLocaleString()} sub="deep-confirmed" accent />
        <div className="flex min-w-[150px] flex-1 flex-col gap-0.5 rounded-lg border bg-muted/40 px-4 py-3">
          <span className="text-xs text-muted-foreground">Est. cost today</span>
          <span className="text-2xl font-semibold tabular-nums">${pipeline.costUsd.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">
            ${pipeline.costPer1k.toFixed(2)} per 1,000 signals
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search headline or client…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-60 pl-7"
          />
        </div>
        <Select value={source} onValueChange={(v) => v && setSource(v)}>
          <SelectTrigger size="sm" className="w-[140px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={tier} onValueChange={(v) => v && setTier(v)}>
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All tiers</SelectItem>
              <SelectItem value="Rules">Rules</SelectItem>
              <SelectItem value="LLM">LLM</SelectItem>
              <SelectItem value="Deep">Deep</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={outcome} onValueChange={(v) => v && setOutcome(v)}>
          <SelectTrigger size="sm" className="w-[150px]">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="Alert raised">Alert raised</SelectItem>
              <SelectItem value="Supporting signal">Supporting</SelectItem>
              <SelectItem value="Filtered">Filtered</SelectItem>
              <SelectItem value="No client match">No client match</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} of {events.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="w-28">Time</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Signal</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? (
              filtered.map((e) => (
                <TableRow
                  key={e.id}
                  onClick={() => e.clientId && router.push(`/clients/${e.clientId}`)}
                  className={e.clientId ? "cursor-pointer" : ""}
                >
                  <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                    <div className="flex flex-col">
                      <span>{fmtDate(e.ts)}</span>
                      <span className="text-xs">{e.time}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {e.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.type}</TableCell>
                  <TableCell>
                    {e.url ? (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(ev) => ev.stopPropagation()}
                        className="block max-w-80 truncate text-primary underline-offset-4 hover:underline"
                        title={e.headline}
                      >
                        {e.headline}
                      </a>
                    ) : (
                      <span className="block max-w-80 truncate" title={e.headline}>
                        {e.headline}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {e.clientName ? (
                      <span className="font-medium">{e.clientName}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <TierBadge tier={e.tier} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        ${e.costUsd < 0.001 ? e.costUsd.toFixed(5) : e.costUsd.toFixed(3)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <OutcomeBadge outcome={e.outcome} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No events match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

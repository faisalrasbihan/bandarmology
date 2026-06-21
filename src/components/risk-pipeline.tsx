"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronRightIcon, InfoIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { STAGE_META, type CaseStage } from "@/lib/case-stages"
import type { PipelineCounts } from "@/lib/pipeline-counts"

// The five operational stages a risk moves through, each owning a page. This is
// the workflow funnel; the AI cost funnel (below) is what *produces* the
// "incoming" count at the top of it.
export type PipelineStage = "incoming" | CaseStage

// Each stage's tone when it's the current page. Only two stages get a special
// treatment: "incoming" (these are alerts → red) and "investigation" (cases that
// need action today → amber). The rest use the standard primary highlight, so
// Marked / Escalated / Closed all look the same.
type StageTone = "alert" | "action" | "standard"

const STAGES: {
  key: PipelineStage
  label: string
  href: string
  sub: string
  tone: StageTone
}[] = [
  { key: "incoming", label: "Risk Incoming", href: "/", sub: "awaiting triage", tone: "alert" },
  { key: "marked", label: "Marked", href: STAGE_META.marked.href, sub: "on Clients", tone: "standard" },
  { key: "investigation", label: "Under Investigation", href: STAGE_META.investigation.href, sub: "in Investigations", tone: "action" },
  { key: "escalated", label: "Escalated", href: STAGE_META.escalated.href, sub: "on Watchlist", tone: "standard" },
  { key: "closed", label: "Closed", href: STAGE_META.closed.href, sub: "in Audit Log", tone: "standard" },
]

const TONE_HIGHLIGHT: Record<StageTone, string> = {
  alert: "border-red-600/50 bg-red-600/10 text-red-600 ring-2 ring-red-600/20 dark:text-red-500",
  action: "border-amber-600/50 bg-amber-600/10 text-amber-600 ring-2 ring-amber-600/20 dark:text-amber-500",
  standard: "border-primary bg-primary/10 text-foreground ring-2 ring-primary/25",
}

// Contextual header per page: the current stage's count framed in its own words,
// plus an optional emphasis badge for the two special stages.
const STAGE_CONTEXT: Record<PipelineStage, { note: string; badge?: { text: string; cls: string } }> = {
  incoming: {
    note: "alerts awaiting triage",
    badge: { text: "Alerts", cls: "border-red-600/40 text-red-600 dark:text-red-500" },
  },
  marked: { note: "flagged client cases" },
  investigation: {
    note: "cases with activity to review",
  },
  escalated: { note: "clients on the watchlist" },
  closed: { note: "cases closed" },
}

// Illustrative cost-staged pipeline economics (one polling window). Each stage
// is a cheaper filter that only passes survivors to the next, more expensive
// one — so the expensive models touch a tiny fraction of volume. The numbers map
// 1:1 to the backend: Stage 1 = src/server/filter (free rules), Stage 2 =
// classify/stage2 (Haiku), Stage 3 = classify/stage3 (Sonnet).
const ECON = {
  scanned: 1000,
  stages: [
    { tag: "Stage 1", name: "Rules filter", tech: "keyword + lexical · no AI", out: 120, perItem: "$0 / item", tone: "rules" as const },
    { tag: "Stage 2", name: "Cheap AI", tech: "Haiku · classify", out: 40, perItem: "~$0.001 / item", tone: "cheap" as const },
    { tag: "Stage 3", name: "Deep AI", tech: "Sonnet · deep analysis", out: 9, perItem: "~$0.02 / item", tone: "deep" as const },
  ],
  costPer1k: 0.93,
  allDeepPer1k: 20.0,
}
const SAVED_PCT = Math.round((1 - ECON.costPer1k / ECON.allDeepPer1k) * 100)
// Share of volume removed by the free Stage 1 rules — i.e. where the saving is.
const STAGE1_DROP_PCT = Math.round(((ECON.scanned - ECON.stages[0].out) / ECON.scanned) * 100)

const TONE_CLASS: Record<string, string> = {
  out: "border-red-600/40 bg-red-600/5",
  deep: "border-violet-500/40 bg-violet-500/5",
  cheap: "border-sky-500/40 bg-sky-500/5",
  rules: "border-emerald-500/40 bg-emerald-500/5",
  muted: "bg-muted/30",
}

function FunnelNode({
  tag,
  big,
  label,
  sub,
  perItem,
  tone = "muted",
}: {
  tag?: string
  big: string | number
  label: string
  sub?: string
  perItem?: string
  tone?: "muted" | "rules" | "cheap" | "deep" | "out"
}) {
  return (
    <div className={`flex min-w-[120px] flex-1 flex-col gap-0.5 rounded-lg border px-3 py-2 ${TONE_CLASS[tone]}`}>
      {tag && (
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{tag}</span>
      )}
      <span className="text-lg font-semibold tabular-nums">{big}</span>
      <span className="text-xs font-medium">{label}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
      {perItem && <span className="mt-0.5 text-[11px] font-medium tabular-nums">{perItem}</span>}
    </div>
  )
}

function Arrow() {
  return <ChevronRightIcon className="hidden size-4 shrink-0 self-center text-muted-foreground sm:block" />
}

// The gap between two stages: how many items were filtered out there (and so
// never cost anything downstream). "free" marks the Stage 1 drop.
function Drop({ n, free }: { n: number; free?: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center self-center">
      <ChevronRightIcon className="size-4 text-muted-foreground" />
      <span className={`text-[10px] tabular-nums ${free ? "font-medium text-emerald-600 dark:text-emerald-500" : "text-muted-foreground"}`}>
        −{n.toLocaleString()}
        {free ? " free" : ""}
      </span>
    </div>
  )
}

function EconomicsFunnel() {
  const drop1 = ECON.scanned - ECON.stages[0].out
  const drop2 = ECON.stages[0].out - ECON.stages[1].out
  const drop3 = ECON.stages[1].out - ECON.stages[2].out
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Cost-staged AI pipeline</span>
        <span className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-500">
          ~{SAVED_PCT}% cheaper than all-deep
        </span>
      </div>

      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
        <FunnelNode big={ECON.scanned.toLocaleString()} label="signals scanned" sub="Stage 0 · ingestion" tone="muted" />
        <Drop n={drop1} free />
        <FunnelNode tag={ECON.stages[0].tag} big={ECON.stages[0].out} label={ECON.stages[0].name} sub={ECON.stages[0].tech} perItem={ECON.stages[0].perItem} tone="rules" />
        <Drop n={drop2} />
        <FunnelNode tag={ECON.stages[1].tag} big={ECON.stages[1].out} label={ECON.stages[1].name} sub={ECON.stages[1].tech} perItem={ECON.stages[1].perItem} tone="cheap" />
        <Drop n={drop3} />
        <FunnelNode tag={ECON.stages[2].tag} big={ECON.stages[2].out} label={ECON.stages[2].name} sub={ECON.stages[2].tech} perItem={ECON.stages[2].perItem} tone="deep" />
        <Arrow />
        <FunnelNode big={ECON.stages[2].out} label="Risk Incoming" sub="surfaced to analyst" tone="out" />
      </div>

      <div className="rounded-md border-l-2 border-emerald-600/50 bg-emerald-600/5 px-3 py-2 text-xs">
        <span className="font-medium">Where the cost is saved:</span>{" "}
        <span className="text-muted-foreground">
          Stage 1 rules clear <span className="font-medium text-foreground">{STAGE1_DROP_PCT}%</span> of signals for{" "}
          <span className="font-medium text-emerald-600 dark:text-emerald-500">$0</span> before any model runs, so the
          deep model (Stage 3) only ever sees <span className="font-medium text-foreground">{ECON.stages[2].out}</span>.
          That&apos;s <span className="font-medium text-foreground">≈ ${ECON.costPer1k.toFixed(2)} / 1,000 alerts</span>{" "}
          vs ≈ ${ECON.allDeepPer1k.toFixed(0)} if every signal hit the deep model.
        </span>
      </div>
    </div>
  )
}

/**
 * The risk pipeline shown identically on every page. `current` marks which stage
 * this page owns (highlighted, non-clickable); the others link to their page.
 * The cost-staged AI funnel that produces the incoming count is available on
 * every page by hovering (or focusing) the "Risk Incoming" stage.
 */
export function RiskPipeline({ current, counts }: { current: PipelineStage; counts: PipelineCounts }) {
  const router = useRouter()
  const countFor = (key: PipelineStage) => counts[key]
  const ctx = STAGE_CONTEXT[current]
  const currentLabel = STAGES.find((s) => s.key === current)?.label

  return (
    <div className="flex flex-col gap-3 px-4 lg:px-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Risk pipeline</h2>
          {ctx.badge && (
            <Badge variant="outline" className={ctx.badge.cls}>
              {ctx.badge.text}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          You are on the <span className="font-medium text-foreground">{currentLabel}</span> stage.{" "}
          {current === "closed" ? (
            <>
              <span className="font-medium text-foreground tabular-nums">{counts.closed}</span> of{" "}
              <span className="font-medium text-foreground tabular-nums">{counts.marked}</span> cases closed.
            </>
          ) : (
            <>
              <span className="font-medium text-foreground tabular-nums">{countFor(current)}</span>{" "}
              {ctx.note}.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-stretch gap-1.5">
        {STAGES.map((s, i) => {
          const isCurrent = s.key === current
          const isIncoming = s.key === "incoming"
          return (
            <React.Fragment key={s.key}>
              {i > 0 && <Arrow />}
              <div className={`relative flex min-w-[124px] flex-1 ${isIncoming ? "group/econ" : ""}`}>
                <button
                  type="button"
                  aria-current={isCurrent ? "page" : undefined}
                  onClick={() => {
                    if (isCurrent && isIncoming) {
                      document.getElementById("incoming-risk")?.scrollIntoView({ behavior: "smooth", block: "start" })
                    } else if (!isCurrent) {
                      router.push(s.href)
                    }
                  }}
                  className={`flex w-full flex-col gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors ${
                    isCurrent
                      ? TONE_HIGHLIGHT[s.tone]
                      : "cursor-pointer hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  }`}
                >
                  <span className={`flex items-center gap-1 text-xs ${isCurrent ? "font-medium" : "text-muted-foreground"}`}>
                    {s.label}
                    {isIncoming && <InfoIcon className="size-3 opacity-60" />}
                  </span>
                  <span className="text-2xl font-semibold tabular-nums">{countFor(s.key)}</span>
                  <span className="text-xs text-muted-foreground">{s.sub}</span>
                </button>

                {/* Cost-staged AI funnel — revealed on hover/focus of Risk Incoming. */}
                {isIncoming && (
                  <div className="invisible absolute top-full left-0 z-30 mt-2 w-[min(720px,92vw)] opacity-0 shadow-lg transition-opacity group-hover/econ:visible group-hover/econ:opacity-100 group-focus-within/econ:visible group-focus-within/econ:opacity-100">
                    <EconomicsFunnel />
                  </div>
                )}
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

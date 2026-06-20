"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronRightIcon } from "lucide-react"

import {
  STAGE_META,
  useFunnelCounts,
  type CaseStage,
} from "@/lib/case-stages"
import { RISK_EVENTS } from "@/lib/risk-events"

// The five operational stages a risk moves through, each owning a page. This is
// the workflow funnel; the AI cost funnel (below) is what *produces* the
// "incoming" count at the top of it.
export type PipelineStage = "incoming" | CaseStage

const STAGES: {
  key: PipelineStage
  label: string
  href: string
  sub: string
  accent: string // ring/text colour when this stage is the current page
}[] = [
  { key: "incoming", label: "Risk Incoming", href: "/", sub: "awaiting triage", accent: "red" },
  { key: "marked", label: "Marked", href: STAGE_META.marked.href, sub: "on Clients", accent: "sky" },
  { key: "investigation", label: "Under Investigation", href: STAGE_META.investigation.href, sub: "in Investigations", accent: "amber" },
  { key: "escalated", label: "Escalated", href: STAGE_META.escalated.href, sub: "on Watchlist", accent: "orange" },
  { key: "closed", label: "Closed", href: STAGE_META.closed.href, sub: "in Audit Log", accent: "emerald" },
]

const ACCENT_ON: Record<string, string> = {
  red: "border-red-600/50 bg-red-600/10 text-red-600 dark:text-red-500",
  sky: "border-sky-500/50 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  amber: "border-amber-600/50 bg-amber-600/10 text-amber-600 dark:text-amber-500",
  orange: "border-orange-600/50 bg-orange-600/10 text-orange-600 dark:text-orange-500",
  emerald: "border-emerald-600/50 bg-emerald-600/10 text-emerald-600 dark:text-emerald-500",
}

// Illustrative cost-staged pipeline economics (one polling window). Each stage
// is a cheaper filter that only passes survivors to the next, more expensive
// one — so the expensive models touch a tiny fraction of volume.
const ECON = {
  scanned: 1000,
  steps: [
    { label: "Stage 1 · Rules", tech: "keyword + lexical, no AI", out: 120 },
    { label: "Stage 2 · Cheap AI", tech: "Haiku classify", out: 40 },
    { label: "Stage 3 · Deep AI", tech: "Sonnet analysis", out: 9 },
  ],
  incoming: 9,
  costPer1k: 0.93,
  allDeepPer1k: 20.0,
}
const SAVED_PCT = Math.round((1 - ECON.costPer1k / ECON.allDeepPer1k) * 100)

function FunnelNode({
  big,
  label,
  sub,
  tone,
}: {
  big: string | number
  label: string
  sub?: string
  tone?: "muted" | "rules" | "cheap" | "deep" | "out"
}) {
  const toneClass =
    tone === "out"
      ? "border-red-600/40 bg-red-600/5"
      : tone === "deep"
        ? "border-violet-500/40 bg-violet-500/5"
        : tone === "cheap"
          ? "border-sky-500/40 bg-sky-500/5"
          : tone === "rules"
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "bg-muted/30"
  return (
    <div className={`flex min-w-[112px] flex-1 flex-col gap-0.5 rounded-lg border px-3 py-2 ${toneClass}`}>
      <span className="text-lg font-semibold tabular-nums">{big}</span>
      <span className="text-xs font-medium">{label}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  )
}

function Arrow() {
  return <ChevronRightIcon className="hidden size-4 shrink-0 self-center text-muted-foreground sm:block" />
}

function EconomicsFunnel() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Cost-staged AI pipeline</span>
        <span className="text-xs text-muted-foreground">
          cheap filters first — the deep model touches &lt;1% of volume
        </span>
      </div>
      <div className="flex flex-wrap items-stretch gap-1.5 overflow-x-auto">
        <FunnelNode big={ECON.scanned.toLocaleString()} label="signals scanned" sub="all public sources" tone="muted" />
        <Arrow />
        <FunnelNode big={ECON.steps[0].out} label={ECON.steps[0].label} sub={`${ECON.steps[0].tech} · free`} tone="rules" />
        <Arrow />
        <FunnelNode big={ECON.steps[1].out} label={ECON.steps[1].label} sub={ECON.steps[1].tech} tone="cheap" />
        <Arrow />
        <FunnelNode big={ECON.steps[2].out} label={ECON.steps[2].label} sub={ECON.steps[2].tech} tone="deep" />
        <Arrow />
        <FunnelNode big={ECON.incoming} label="Risk Incoming" sub="surfaced to analyst" tone="out" />
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">≈ ${ECON.costPer1k.toFixed(2)} / 1,000 alerts</span>{" "}
        vs ≈ ${ECON.allDeepPer1k.toFixed(0)} if every signal hit the deep model —{" "}
        <span className="font-medium text-emerald-600 dark:text-emerald-500">~{SAVED_PCT}% cheaper</span>.
      </p>
    </div>
  )
}

/**
 * The risk pipeline shown on every page. `current` marks which stage this page
 * owns (highlighted, non-clickable); the others link to their page. Pass
 * `showEconomics` on the dashboard to also show the cost-staged AI funnel that
 * produces the incoming count.
 */
export function RiskPipeline({
  current,
  showEconomics = false,
}: {
  current: PipelineStage
  showEconomics?: boolean
}) {
  const router = useRouter()
  const counts = useFunnelCounts(RISK_EVENTS)
  const countFor = (key: PipelineStage) => (key === "incoming" ? counts.incoming : counts[key])

  return (
    <div className="flex flex-col gap-3 px-4 lg:px-6">
      <div className="flex flex-col">
        <h2 className="text-base font-semibold">Risk pipeline</h2>
        <p className="text-sm text-muted-foreground">
          Every case moves by an explicit, logged human decision — you are on the{" "}
          <span className="font-medium text-foreground">
            {STAGES.find((s) => s.key === current)?.label}
          </span>{" "}
          stage.
        </p>
      </div>

      {showEconomics && <EconomicsFunnel />}

      <div className="flex flex-wrap items-stretch gap-1.5">
        {STAGES.map((s, i) => {
          const isCurrent = s.key === current
          return (
            <div key={s.key} className="contents">
              {i > 0 && <Arrow />}
              <button
                type="button"
                aria-current={isCurrent ? "page" : undefined}
                onClick={() => {
                  if (isCurrent && s.key === "incoming") {
                    document.getElementById("incoming-risk")?.scrollIntoView({ behavior: "smooth", block: "start" })
                  } else if (!isCurrent) {
                    router.push(s.href)
                  }
                }}
                className={`flex min-w-[124px] flex-1 flex-col gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors ${
                  isCurrent
                    ? `${ACCENT_ON[s.accent]} ring-2 ring-current/20`
                    : "cursor-pointer hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                }`}
              >
                <span className={`text-xs ${isCurrent ? "font-medium" : "text-muted-foreground"}`}>{s.label}</span>
                <span className="text-2xl font-semibold tabular-nums">{countFor(s.key)}</span>
                <span className="text-xs text-muted-foreground">{s.sub}</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

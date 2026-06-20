"use client"

import { useRouter } from "next/navigation"
import { ChevronRightIcon } from "lucide-react"

import {
  STAGE_ORDER,
  STAGE_META,
  useFunnelCounts,
  type CaseStage,
} from "@/lib/case-stages"
import { RISK_EVENTS } from "@/lib/risk-events"

// Sub-labels keep the funnel self-explanatory: each stage names the page the
// case lives on once it gets there.
const STAGE_SUB: Record<CaseStage, string> = {
  marked: "cases on Clients",
  investigation: "in Investigations",
  escalated: "on the Watchlist",
  closed: "in the Audit Log",
}

function Stage({
  label,
  value,
  sub,
  onActivate,
  accent,
}: {
  label: string
  value: number
  sub: string
  onActivate: () => void
  accent?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className={`flex min-w-[130px] flex-1 cursor-pointer flex-col gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
        accent ? "border-red-600/30 bg-red-600/5" : ""
      }`}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </button>
  )
}

function Arrow() {
  return (
    <div className="hidden items-center text-muted-foreground sm:flex">
      <ChevronRightIcon className="size-4" />
    </div>
  )
}

export function RiskFunnel() {
  const router = useRouter()
  const counts = useFunnelCounts(RISK_EVENTS)

  const stages = [
    {
      key: "incoming",
      label: "Risk Incoming",
      value: counts.incoming,
      sub: "events awaiting triage",
      accent: true,
      onActivate: () =>
        document
          .getElementById("incoming-risk")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    },
    ...STAGE_ORDER.map((stage) => ({
      key: stage,
      label: STAGE_META[stage].label,
      value: counts[stage],
      sub: STAGE_SUB[stage],
      accent: false,
      onActivate: () => router.push(STAGE_META[stage].href),
    })),
  ]

  return (
    <div className="flex flex-col gap-2 px-4 lg:px-6">
      <div className="flex flex-col">
        <h2 className="text-base font-semibold">Risk pipeline</h2>
        <p className="text-sm text-muted-foreground">
          Incoming events become client cases when you mark them, then move
          through the workflow — each step is an explicit, logged decision.
        </p>
      </div>

      <div className="flex flex-wrap items-stretch gap-2">
        {stages.map((s, i) => (
          <div key={s.key} className="contents">
            {i > 0 && <Arrow />}
            <Stage
              label={s.label}
              value={s.value}
              sub={s.sub}
              accent={s.accent}
              onActivate={s.onActivate}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

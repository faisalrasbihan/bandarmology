"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Separator } from "@/components/ui/separator"
import { EscalateDialog } from "@/components/escalate-dialog"
import { useIsMobile } from "@/hooks/use-mobile"

const chartConfig = {
  score: { label: "Risk score", color: "var(--chart-1)" },
} satisfies ChartConfig

const MONTHS = [
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
]

const BASELINE: Record<string, number> = { Low: 26, Medium: 46, High: 64 }

const RAMP_START = 8 // index where drift begins (Mar)

// A signal that drove the risk drift. Markers are placed on the timeline at the
// month they were detected; `followedUp` decides whether the marker reads as a
// fresh alert (red) or an already-handled event (muted).
export interface ChartSignal {
  id: string
  date: string
  source: string
  headline: string
  observed: string
  reasoning: string
  signalLabel: string
  followedUp: boolean
}

const NEW_COLOR = "var(--destructive)"
const DONE_COLOR = "var(--muted-foreground)"

// Deterministic 12-month series: flat at the onboarding baseline, then a ramp
// to the current score over the final months — the moment KYC drift sets in.
function buildSeries(originalRisk: string, currentScore: number) {
  const base = BASELINE[originalRisk] ?? 40
  return MONTHS.map((month, i) => {
    let score: number
    if (i < RAMP_START) {
      score = base + ((i % 3) - 1) * 2 // gentle noise around baseline
    } else {
      const progress = (i - RAMP_START + 1) / (MONTHS.length - RAMP_START)
      score = Math.round(base + (currentScore - base) * progress)
    }
    return { month, score: Math.max(0, Math.min(100, Math.round(score))) }
  })
}

export function RiskDriftChart({
  originalRisk,
  currentScore,
  signals = [],
  clientName,
  defaultAction,
}: {
  originalRisk: string
  currentScore: number
  signals?: ChartSignal[]
  clientName: string
  defaultAction: string
}) {
  const data = buildSeries(originalRisk, currentScore)

  // Locally track signals the reviewer marks as followed up, so a fresh (red)
  // marker turns muted without needing a round-trip.
  const [followedUp, setFollowedUp] = React.useState<Set<string>>(new Set())
  const [selected, setSelected] = React.useState<ChartSignal | null>(null)

  const isFollowedUp = (s: ChartSignal) => s.followedUp || followedUp.has(s.id)

  // Signals arrive oldest→newest. Spread them across the drift ramp (Mar→Jun) so
  // each marker sits at a distinct point on the rising curve, with the newest
  // landing at the current score. Real detection dates live in the drawer.
  const lastIndex = MONTHS.length - 1
  const placed = signals.map((s, i) => {
    const idx =
      signals.length <= 1
        ? RAMP_START
        : Math.round(RAMP_START + (i * (lastIndex - RAMP_START)) / (signals.length - 1))
    return { signal: s, month: MONTHS[idx] }
  })

  return (
    <>
      <ChartContainer config={chartConfig} className="aspect-auto h-full min-h-[200px] w-full">
        <AreaChart data={data} margin={{ left: 0, right: 12, top: 18 }}>
          <defs>
            <linearGradient id="fillScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-score)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-score)" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={28} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
          <Area
            dataKey="score"
            type="monotone"
            fill="url(#fillScore)"
            stroke="var(--color-score)"
            strokeWidth={2}
          />
          {placed.map(({ signal, month }) => {
            const color = isFollowedUp(signal) ? DONE_COLOR : NEW_COLOR
            return (
              <ReferenceLine
                key={`line-${signal.id}`}
                x={month}
                stroke={color}
                strokeWidth={1.5}
                strokeOpacity={0.4}
              />
            )
          })}
          {placed.map(({ signal, month }) => {
            const color = isFollowedUp(signal) ? DONE_COLOR : NEW_COLOR
            return (
              <ReferenceDot
                key={`flag-${signal.id}`}
                x={month}
                y={100}
                // Clickable rounded-square "flag" pinned to the top of the line.
                shape={(props) => {
                  const { cx = 0, cy = 0 } = props as { cx?: number; cy?: number }
                  const size = 13
                  return (
                    <g
                      role="button"
                      transform={`translate(${cx - size / 2}, ${cy})`}
                      className="cursor-pointer"
                      onClick={() => setSelected(signal)}
                    >
                      {/* widened transparent hit area */}
                      <rect x={-4} y={-4} width={size + 8} height={size + 8} fill="transparent" />
                      <rect
                        width={size}
                        height={size}
                        rx={4}
                        ry={4}
                        fill={color}
                        stroke="var(--background)"
                        strokeWidth={2}
                      />
                    </g>
                  )
                }}
              />
            )
          })}
        </AreaChart>
      </ChartContainer>

      <SignalDrawer
        signal={selected}
        clientName={clientName}
        defaultAction={defaultAction}
        followedUp={selected ? isFollowedUp(selected) : false}
        onOpenChange={(open) => !open && setSelected(null)}
        onMarkFollowedUp={(s) => {
          setFollowedUp((prev) => new Set(prev).add(s.id))
          setSelected(null)
          toast.success(`Marked "${s.signalLabel}" as followed up`, {
            description: `${s.source} · ${clientName}`,
          })
        }}
      />
    </>
  )
}

function SignalDrawer({
  signal,
  clientName,
  defaultAction,
  followedUp,
  onOpenChange,
  onMarkFollowedUp,
}: {
  signal: ChartSignal | null
  clientName: string
  defaultAction: string
  followedUp: boolean
  onOpenChange: (open: boolean) => void
  onMarkFollowedUp: (s: ChartSignal) => void
}) {
  const isMobile = useIsMobile()
  if (!signal) return null

  return (
    <Drawer open={!!signal} onOpenChange={onOpenChange} direction={isMobile ? "bottom" : "right"}>
      <DrawerContent className="sm:max-w-md">
        <DrawerHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-muted-foreground">
              {signal.signalLabel}
            </Badge>
            {followedUp ? (
              <Badge variant="secondary" className="font-normal">
                Followed up
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-destructive/40 font-normal text-destructive"
              >
                New
              </Badge>
            )}
          </div>
          <DrawerTitle>Detected change</DrawerTitle>
          <DrawerDescription>
            {signal.source} · detected {signal.date}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4 text-sm">
          <p>{signal.observed}</p>
          <Separator />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Why this fired
            </span>
            <p className="text-muted-foreground">{signal.reasoning}</p>
          </div>
        </div>

        <DrawerFooter>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={followedUp}
              onClick={() => onMarkFollowedUp(signal)}
            >
              {followedUp ? "Followed up" : "Mark as followed up"}
            </Button>
            <EscalateDialog
              client={clientName}
              defaultAction={defaultAction}
              trigger={
                <Button variant="outline" className="w-full">
                  Escalate
                </Button>
              }
            />
          </div>
          <DrawerClose asChild>
            <Button variant="ghost">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

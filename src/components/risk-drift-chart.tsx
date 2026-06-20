"use client"

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const chartConfig = {
  score: { label: "Risk score", color: "var(--chart-1)" },
} satisfies ChartConfig

const MONTHS = [
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
]

const BASELINE: Record<string, number> = { Low: 26, Medium: 46, High: 64 }

// Deterministic 12-month series: flat at the onboarding baseline, then a ramp
// to the current score over the final months — the moment KYC drift sets in.
function buildSeries(originalRisk: string, currentScore: number) {
  const base = BASELINE[originalRisk] ?? 40
  const rampStart = 8 // index where drift begins
  return MONTHS.map((month, i) => {
    let score: number
    if (i < rampStart) {
      score = base + ((i % 3) - 1) * 2 // gentle noise around baseline
    } else {
      const progress = (i - rampStart + 1) / (MONTHS.length - rampStart)
      score = Math.round(base + (currentScore - base) * progress)
    }
    return { month, score: Math.max(0, Math.min(100, Math.round(score))) }
  })
}

export function RiskDriftChart({
  originalRisk,
  currentScore,
}: {
  originalRisk: string
  currentScore: number
}) {
  const data = buildSeries(originalRisk, currentScore)
  const eventMonth = MONTHS[8]

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
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
        <ReferenceLine
          x={eventMonth}
          stroke="var(--color-score)"
          strokeDasharray="4 4"
          label={{ value: "Signal detected", position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <Area
          dataKey="score"
          type="monotone"
          fill="url(#fillScore)"
          stroke="var(--color-score)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}

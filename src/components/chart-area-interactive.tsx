"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

export const description = "New risk alerts over time by signal category"

// Deterministic generator so server and client render identical markup.
// Builds 90 days of daily alert counts across four signal categories,
// with a deliberate spike in the final week (the demo "story").
function buildChartData() {
  const days = 90
  const end = new Date("2026-06-20")
  const data: {
    date: string
    adverseMedia: number
    kycDrift: number
    sanctions: number
    structural: number
  }[] = []

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(end)
    date.setDate(end.getDate() - i)
    const t = days - 1 - i // 0..89, increasing toward today
    const wave = (phase: number) => Math.sin((t + phase) / 6)
    const recentSpike = t > days - 8 ? (t - (days - 8)) * 1.4 : 0

    data.push({
      date: date.toISOString().slice(0, 10),
      adverseMedia: Math.round(4 + 2 * (wave(0) + 1) + recentSpike * 1.8),
      kycDrift: Math.round(2 + 1.5 * (wave(3) + 1) + recentSpike * 1.3),
      sanctions: Math.round(1 + 1 * (wave(5) + 1) + recentSpike * 0.6),
      structural: Math.round(2 + 1.2 * (wave(8) + 1) + recentSpike * 0.4),
    })
  }
  return data
}

const chartData = buildChartData()

const chartConfig = {
  alerts: {
    label: "Alerts",
  },
  adverseMedia: {
    label: "Adverse Media",
    color: "var(--chart-1)",
  },
  kycDrift: {
    label: "KYC Drift",
    color: "var(--chart-2)",
  },
  sanctions: {
    label: "Sanctions",
    color: "var(--chart-3)",
  },
  structural: {
    label: "Structuring",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("90d")

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  const filteredData = chartData.filter((item) => {
    const date = new Date(item.date)
    const referenceDate = new Date("2026-06-20")
    let daysToSubtract = 90
    if (timeRange === "30d") {
      daysToSubtract = 30
    } else if (timeRange === "7d") {
      daysToSubtract = 7
    }
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    return date >= startDate
  })

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>New Risk Alerts</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            New alerts by signal category over the last 3 months
          </span>
          <span className="@[540px]/card:hidden">By signal category</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            multiple={false}
            value={timeRange ? [timeRange] : []}
            onValueChange={(value) => {
              setTimeRange(value[0] ?? "90d")
            }}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={timeRange}
            onValueChange={(value) => {
              if (value !== null) {
                setTimeRange(value)
              }
            }}
          >
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Last 3 months
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillAdverseMedia" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-adverseMedia)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-adverseMedia)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillKycDrift" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-kycDrift)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-kycDrift)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillSanctions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-sanctions)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-sanctions)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillStructural" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-structural)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-structural)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="structural"
              type="natural"
              fill="url(#fillStructural)"
              stroke="var(--color-structural)"
              stackId="a"
            />
            <Area
              dataKey="sanctions"
              type="natural"
              fill="url(#fillSanctions)"
              stroke="var(--color-sanctions)"
              stackId="a"
            />
            <Area
              dataKey="kycDrift"
              type="natural"
              fill="url(#fillKycDrift)"
              stroke="var(--color-kycDrift)"
              stackId="a"
            />
            <Area
              dataKey="adverseMedia"
              type="natural"
              fill="url(#fillAdverseMedia)"
              stroke="var(--color-adverseMedia)"
              stackId="a"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Pipeline mix</span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" />
          68% rules
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-sky-500" />
          24% LLM
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-violet-500" />
          8% deep
        </span>
        <span className="ml-auto tabular-nums">~$2.10 / 1k analyses</span>
      </CardFooter>
    </Card>
  )
}

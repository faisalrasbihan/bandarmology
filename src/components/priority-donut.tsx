"use client"

import * as React from "react"
import { Label, Pie, PieChart } from "recharts"

import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

import data from "@/app/data.json"

const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"] as const

const chartConfig = {
  count: { label: "Alerts" },
  Critical: { label: "Critical", color: "oklch(0.577 0.245 27.325)" },
  High: { label: "High", color: "oklch(0.769 0.188 70.08)" },
  Medium: { label: "Medium", color: "oklch(0.828 0.189 84.429)" },
  Low: { label: "Low", color: "oklch(0.556 0 0)" },
} satisfies ChartConfig

const chartData = PRIORITY_ORDER.map((priority) => ({
  priority,
  count: data.filter((d) => d.severity === priority).length,
  fill: `var(--color-${priority})`,
}))

export function PriorityDonut() {
  const total = React.useMemo(
    () => chartData.reduce((sum, d) => sum + d.count, 0),
    []
  )

  return (
    <Card className="flex flex-col @container/card">
      <CardHeader>
        <CardTitle>Open Alerts by Priority</CardTitle>
        <CardDescription>Current distribution across the book</CardDescription>
      </CardHeader>
      <div className="flex flex-1 items-center justify-center pb-2">
        <ChartContainer
          config={chartConfig}
          className="aspect-square h-[230px] w-full"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="priority"
              innerRadius={62}
              strokeWidth={4}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-3xl font-semibold"
                        >
                          {total}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 22}
                          className="fill-muted-foreground text-xs"
                        >
                          Open alerts
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </div>
      <CardFooter className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t pt-4 text-xs text-muted-foreground">
        {chartData.map((d) => (
          <span key={d.priority} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: `var(--color-${d.priority})` }}
            />
            {d.priority} ({d.count})
          </span>
        ))}
      </CardFooter>
    </Card>
  )
}

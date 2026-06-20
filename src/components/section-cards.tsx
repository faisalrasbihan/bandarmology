"use client"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ArrowUpIcon } from "lucide-react"

function scrollToFlaggedAlerts() {
  document
    .getElementById("flagged-alerts")
    ?.scrollIntoView({ behavior: "smooth", block: "start" })
}

function DeltaBadge({ value }: { value: string }) {
  return (
    <Badge variant="outline" className="gap-0.5 text-amber-600 dark:text-amber-500">
      <ArrowUpIcon className="size-3" />
      {value}
    </Badge>
  )
}

export function SectionCards() {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card
        role="button"
        tabIndex={0}
        aria-label="Jump to flagged alerts"
        onClick={scrollToFlaggedAlerts}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            scrollToFlaggedAlerts()
          }
        }}
        className="@container/card cursor-pointer transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <CardHeader>
          <CardDescription>Critical Alerts</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums text-red-600 dark:text-red-500">
            3
          </CardTitle>
          <CardAction>
            <DeltaBadge value="+2" />
          </CardAction>
        </CardHeader>
        <CardFooter className="text-sm text-muted-foreground">
          Awaiting escalation
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Re-KYC Required</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums">
            7
          </CardTitle>
          <CardAction>
            <DeltaBadge value="+3" />
          </CardAction>
        </CardHeader>
        <CardFooter className="text-sm text-muted-foreground">
          KYC drift detected
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Portfolio Risk</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums">
            62<span className="text-base font-normal text-muted-foreground">/100</span>
          </CardTitle>
          <CardAction>
            <DeltaBadge value="+5" />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-stretch gap-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-amber-500" style={{ width: "62%" }} />
          </div>
          <span className="text-sm text-muted-foreground">48 active clients</span>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Watchlist Hits</CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums">
            11
          </CardTitle>
          <CardAction>
            <DeltaBadge value="+4" />
          </CardAction>
        </CardHeader>
        <CardFooter className="text-sm text-muted-foreground">
          OFAC · EU · PEP
        </CardFooter>
      </Card>
    </div>
  )
}

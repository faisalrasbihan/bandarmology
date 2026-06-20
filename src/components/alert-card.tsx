import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"
import { exposureAtRisk, formatMoney } from "@/lib/format"
import {
  initials,
  RiskDrift,
  SeverityBadge,
  StatusBadge,
} from "@/components/risk-badges"
import type { Alert } from "@/components/data-table"

// A single Critical/High client tile for the dashboard card view.
// The whole card links to the full client profile for the rich,
// auditable detail (rationale, citations, Layer 1/Layer 2 split).
export function AlertCard({ alert }: { alert: Alert }) {
  return (
    <Link
      href={`/clients/${alert.id}`}
      aria-label={`Open ${alert.client} profile`}
      className="group snap-start focus-visible:outline-none"
    >
      <Card className="flex h-full w-80 shrink-0 flex-col gap-4 transition-colors group-hover:border-primary/40 group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardHeader className="gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <Avatar className="size-10 shrink-0">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-foreground">
                  {initials(alert.client)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-0.5">
                <span className="line-clamp-1 font-medium text-foreground">
                  {alert.client}
                </span>
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {alert.sector} · {alert.jurisdiction}
                </span>
              </div>
            </div>
            <SeverityBadge severity={alert.severity} />
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <RiskDrift from={alert.originalRisk} to={alert.currentRisk} />
            <span className="text-xs tabular-nums text-muted-foreground">
              {alert.riskScore}/100
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <Badge variant="outline" className="w-fit px-1.5 text-muted-foreground">
              {alert.signal}
            </Badge>
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {alert.trigger}
            </p>
          </div>
        </CardContent>

        <CardFooter className="items-center justify-between border-t pt-4">
          <div className="flex flex-col tabular-nums">
            <span className="text-sm font-medium">
              {formatMoney(alert.exposureUsd)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatMoney(exposureAtRisk(alert.exposureUsd, alert.riskScore))} at risk
            </span>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={alert.status} />
            <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </CardFooter>
      </Card>
    </Link>
  )
}

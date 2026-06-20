import { Badge } from "@/components/ui/badge"
import { ArrowRightIcon, ArrowUpIcon, CircleCheckIcon } from "lucide-react"

export function initials(name: string) {
  return name
    .split(" ")
    .filter((w) => /[A-Za-z0-9]/.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("")
}

export function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "Critical") {
    return <Badge variant="destructive">Critical</Badge>
  }
  if (severity === "High") {
    return (
      <Badge variant="outline" className="border-amber-600/40 text-amber-600 dark:text-amber-500">
        High
      </Badge>
    )
  }
  if (severity === "Medium") {
    return <Badge variant="secondary">Medium</Badge>
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Low
    </Badge>
  )
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "Escalated") {
    return (
      <Badge variant="outline" className="border-amber-600/40 text-amber-600 dark:text-amber-500">
        Escalated
      </Badge>
    )
  }
  if (status === "In Review") {
    return <Badge variant="secondary">In Review</Badge>
  }
  if (status === "Cleared") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <CircleCheckIcon className="fill-green-500 dark:fill-green-400" />
        Cleared
      </Badge>
    )
  }
  return <Badge variant="outline">New</Badge>
}

const RISK_RATING_CLASS: Record<string, string> = {
  High: "text-red-600 dark:text-red-500",
  Medium: "text-amber-600 dark:text-amber-500",
  Low: "text-muted-foreground",
}

export function RiskRating({ rating }: { rating: string }) {
  return (
    <span className={`font-medium ${RISK_RATING_CLASS[rating] ?? ""}`}>{rating}</span>
  )
}

export function RiskDrift({ from, to }: { from: string; to: string }) {
  const escalated = from !== to
  return (
    <div className="flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span className="text-muted-foreground">{from}</span>
      <ArrowRightIcon className="size-3 text-muted-foreground" />
      <RiskRating rating={to} />
      {escalated && <ArrowUpIcon className="size-3 text-red-600 dark:text-red-500" />}
    </div>
  )
}

const RISK_STATUS_CLASS: Record<string, string> = {
  High: "border-red-600/40 text-red-600 dark:text-red-500",
  Medium: "border-amber-600/40 text-amber-600 dark:text-amber-500",
  Low: "text-muted-foreground",
  "Not Applicable": "text-muted-foreground/70 border-dashed",
}

export function RiskStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={RISK_STATUS_CLASS[status] ?? ""}>
      {status}
    </Badge>
  )
}

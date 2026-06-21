"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { initials, RiskDrift } from "@/components/risk-badges"
import type { ClientRecord } from "@/components/client-profile"
import { formatMoney } from "@/lib/format"
import { logAudit } from "@/lib/audit-log"

const TODAY = new Date("2026-06-20")

function reviewStatus(reviewBy: string) {
  const days = Math.round(
    (new Date(reviewBy).getTime() - TODAY.getTime()) / 86_400_000
  )
  if (days < 0)
    return { label: "Overdue", cls: "border-red-600/40 text-red-600 dark:text-red-500" }
  if (days <= 7)
    return {
      label: `Due in ${days}d`,
      cls: "border-amber-600/40 text-amber-600 dark:text-amber-500",
    }
  return { label: `In ${days}d`, cls: "text-muted-foreground" }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border px-4 py-3">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export function WatchlistTable({ clients }: { clients: ClientRecord[] }) {
  const router = useRouter()

  const dueSoon = clients.filter((c) => {
    if (!c.watchlistMeta) return false
    const days = Math.round(
      (new Date(c.watchlistMeta.reviewBy).getTime() - TODAY.getTime()) / 86_400_000
    )
    return days <= 7
  }).length

  const exposureWatched = clients.reduce((sum, c) => sum + c.exposureUsd, 0)

  return (
    <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Watchlist</h1>
        <p className="text-sm text-muted-foreground">
          Clients under enhanced monitoring — placed here by the team for closer review,
          with tighter alert thresholds and a recurring review date.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:max-w-md">
        <Stat label="On watchlist" value={clients.length} />
        <Stat label="Reviews due (≤7d)" value={dueSoon} />
        <Stat label="Exposure watched" value={formatMoney(exposureWatched)} />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Added by</TableHead>
              <TableHead>Review</TableHead>
              <TableHead>Risk Drift</TableHead>
              <TableHead>Exposure</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length ? (
              clients.map((c) => {
                const review = c.watchlistMeta
                  ? reviewStatus(c.watchlistMeta.reviewBy)
                  : null
                return (
                  <TableRow
                    key={c.id}
                    onClick={() => router.push(`/clients/${c.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-foreground">
                            {initials(c.client)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-foreground">{c.client}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.sector} · {c.jurisdiction}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className="block max-w-72 truncate text-muted-foreground"
                        title={c.watchlistMeta?.reason}
                      >
                        {c.watchlistMeta?.reason ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.watchlistMeta?.addedBy ?? "—"}
                    </TableCell>
                    <TableCell>
                      {review && (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className={`w-fit ${review.cls}`}>
                            {review.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {c.watchlistMeta?.reviewBy}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <RiskDrift from={c.originalRisk} to={c.currentRisk} />
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {formatMoney(c.exposureUsd)}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* A risk officer's only action here is to follow up — it's
                          logged to the audit trail; it doesn't resolve the case. */}
                      <div onClick={(e) => e.stopPropagation()} className="inline-flex">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            logAudit({
                              action: "Followed up",
                              entity: c.client,
                              clientId: c.id,
                              severity: c.severity,
                              detail: c.watchlistMeta?.reason ?? "Watchlist review",
                              source: "Watchlist",
                            })
                            toast.success(`Follow-up logged for ${c.client}`, {
                              description: "Recorded in the Audit Log.",
                            })
                          }}
                        >
                          Follow up
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No clients on the watchlist.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

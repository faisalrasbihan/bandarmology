"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleCheckBigIcon,
  EyeIcon,
  FlagIcon,
  MessageSquareIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldXIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { type AuditAction, useAuditLog } from "@/lib/audit-log"

const ACTION_META: Record<
  AuditAction,
  { icon: React.ReactNode; cls: string }
> = {
  Acknowledged: {
    icon: <CheckCircle2Icon className="size-3.5" />,
    cls: "border-emerald-600/40 text-emerald-700 dark:text-emerald-500",
  },
  Escalated: {
    icon: <ShieldAlertIcon className="size-3.5" />,
    cls: "border-red-600/40 text-red-600 dark:text-red-500",
  },
  "Followed up": {
    icon: <MessageSquareIcon className="size-3.5" />,
    cls: "border-sky-500/40 text-sky-600 dark:text-sky-400",
  },
  Confirmed: {
    icon: <ShieldCheckIcon className="size-3.5" />,
    cls: "border-amber-600/40 text-amber-700 dark:text-amber-500",
  },
  "Added to watchlist": {
    icon: <EyeIcon className="size-3.5" />,
    cls: "text-muted-foreground",
  },
  "Removed from watchlist": {
    icon: <ShieldXIcon className="size-3.5" />,
    cls: "text-muted-foreground",
  },
  "Marked for review": {
    icon: <FlagIcon className="size-3.5" />,
    cls: "border-sky-500/40 text-sky-600 dark:text-sky-400",
  },
  "Sent to investigation": {
    icon: <SearchIcon className="size-3.5" />,
    cls: "border-amber-600/40 text-amber-700 dark:text-amber-500",
  },
  "Case closed": {
    icon: <CircleCheckBigIcon className="size-3.5" />,
    cls: "text-muted-foreground",
  },
}

function fmtTs(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AuditLogView() {
  const router = useRouter()
  const entries = useAuditLog()
  const [company, setCompany] = useState("all")

  // Distinct companies present in the log, for the filter dropdown.
  const companies = useMemo(
    () => [...new Set(entries.map((e) => e.entity))].sort(),
    [entries]
  )
  const shown = company === "all" ? entries : entries.filter((e) => e.entity === company)

  return (
    <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Append-only record of every analyst decision across the workflow (marks, escalations,
            follow-ups, and closures), capturing who acted, on which client, and when. This is the
            full decision trail, not only closures.
          </p>
        </div>
        {companies.length > 0 && (
          <Select value={company} onValueChange={(v) => v && setCompany(v)}>
            <SelectTrigger size="sm" className="w-56" aria-label="Filter by company">
              <SelectValue placeholder="All companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies ({entries.length})</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="w-44">When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Client / Entity</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length ? (
              shown.map((e) => {
                const meta = ACTION_META[e.action]
                const clickable = e.clientId != null
                return (
                  <TableRow
                    key={e.id}
                    onClick={
                      clickable
                        ? () => router.push(`/clients/${e.clientId}`)
                        : undefined
                    }
                    className={clickable ? "cursor-pointer" : undefined}
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {fmtTs(e.ts)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1 font-normal ${meta.cls}`}>
                        {meta.icon}
                        {e.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{e.entity}</TableCell>
                    <TableCell className="text-muted-foreground">{e.actor}</TableCell>
                    <TableCell className="max-w-80">
                      <span className="block truncate text-muted-foreground" title={e.detail}>
                        {e.detail ?? "—"}
                      </span>
                      {e.source && (
                        <span className="text-xs text-muted-foreground/70">{e.source}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {clickable && (
                        <ChevronRightIcon className="size-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No decisions recorded yet. Acknowledge or escalate a flag and it will appear here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

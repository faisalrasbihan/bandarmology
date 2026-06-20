"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRightIcon, LayoutGridIcon, TableIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { AlertCard } from "@/components/alert-card"
import { DataTable, type Alert } from "@/components/data-table"

// How many tiles the card view shows before deferring to the Clients page.
const MAX_CARDS = 10

type ViewMode = "cards" | "table"

export function FlaggedAlerts({ data }: { data: Alert[] }) {
  const [view, setView] = React.useState<ViewMode>("cards")

  // Dashboard surfaces only the clients that need attention now:
  // Critical + High, highest risk score first. The full list (incl.
  // Medium/Low) lives on the Clients page.
  const highPriority = React.useMemo(
    () =>
      data
        .filter((d) => d.severity === "Critical" || d.severity === "High")
        .sort((a, b) => b.riskScore - a.riskScore),
    [data]
  )

  const cards = highPriority.slice(0, MAX_CARDS)

  return (
    <div id="flagged-alerts" className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold">Need action today</h2>
          <p className="text-sm text-muted-foreground">
            {highPriority.length} high-priority{" "}
            {highPriority.length === 1 ? "client" : "clients"} flagged for review
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            multiple={false}
            value={[view]}
            onValueChange={(value) => {
              const next = value[0] as ViewMode | undefined
              if (next) setView(next)
            }}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="cards" aria-label="Card view">
              <LayoutGridIcon data-icon="inline-start" />
              <span className="hidden sm:inline">Cards</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Table view">
              <TableIcon data-icon="inline-start" />
              <span className="hidden sm:inline">Table</span>
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/clients" />}
          >
            <span className="hidden lg:inline">View all clients</span>
            <span className="lg:hidden">All</span>
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </div>

      {view === "cards" ? (
        cards.length > 0 ? (
          <div className="flex snap-x scroll-ps-4 gap-4 overflow-x-auto py-3 [scrollbar-width:thin] [&>*:first-child]:ms-4 [&>*:last-child]:me-4 lg:scroll-ps-6 lg:[&>*:first-child]:ms-6 lg:[&>*:last-child]:me-6">
            {cards.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        ) : (
          <p className="px-4 text-sm text-muted-foreground lg:px-6">
            No Critical or High priority alerts right now.
          </p>
        )
      ) : (
        <DataTable data={highPriority} />
      )}
    </div>
  )
}

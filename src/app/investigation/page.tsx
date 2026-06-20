import Link from "next/link"

import { AppShell } from "@/components/app-shell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { initials, RiskDrift, SeverityBadge } from "@/components/risk-badges"
import { type ClientRecord } from "@/components/client-profile"
import { ChevronRightIcon } from "lucide-react"

import data from "@/app/data.json"

// Entry point for "Investigations" in the sidebar — lists every flagged client
// so the analyst has somewhere to drill into the combined internal (Layer 2) +
// on-chain (Layer 1) transaction view. Each card links to /investigation/[id];
// the detail page itself decides whether there's actually activity to show.
export default function InvestigationIndexPage() {
  const clients = (data as ClientRecord[]).filter((c) => c.flagged)

  return (
    <AppShell title="Investigations">
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <p className="text-muted-foreground text-sm">
          Combined internal bank transactions and known public-ledger activity for clients whose
          risk has drifted — merged read-only for display, never written back across layers.
        </p>
        <div className="flex flex-col gap-3">
          {clients.map((c) => (
            <Link key={c.id} href={`/investigation/${c.id}`}>
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center gap-4 py-2">
                  <Avatar className="size-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-sm font-semibold">
                      {initials(c.client)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.client}</span>
                      <SeverityBadge severity={c.severity} />
                      <Badge variant="secondary" className="font-normal">
                        {c.sector}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground text-xs">{c.signal}</span>
                  </div>
                  <RiskDrift from={c.originalRisk} to={c.currentRisk} />
                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
          {clients.length === 0 && (
            <p className="text-muted-foreground text-sm">No flagged clients to investigate.</p>
          )}
        </div>
      </div>
    </AppShell>
  )
}

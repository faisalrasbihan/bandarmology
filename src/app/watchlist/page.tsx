import { AppShell } from "@/components/app-shell"
import { RiskPipeline } from "@/components/risk-pipeline"
import { WatchlistTable } from "@/components/watchlist-table"
import { type ClientRecord } from "@/components/client-profile"
import { getPipelineCounts } from "@/lib/pipeline-counts"

import data from "@/app/data.json"

export default function WatchlistPage() {
  const watched = (data as ClientRecord[]).filter((c) => c.watchlist)
  return (
    <AppShell title="Watchlist">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <RiskPipeline current="escalated" counts={getPipelineCounts()} />
        <WatchlistTable clients={watched} />
      </div>
    </AppShell>
  )
}

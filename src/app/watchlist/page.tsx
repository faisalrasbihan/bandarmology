import { AppShell } from "@/components/app-shell"
import { WatchlistTable } from "@/components/watchlist-table"
import { type ClientRecord } from "@/components/client-profile"

import data from "@/app/data.json"

export default function WatchlistPage() {
  const watched = (data as ClientRecord[]).filter((c) => c.watchlist)
  return (
    <AppShell title="Watchlist">
      <WatchlistTable clients={watched} />
    </AppShell>
  )
}

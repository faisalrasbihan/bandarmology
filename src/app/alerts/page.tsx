import { AppShell } from "@/components/app-shell"
import { AlertsFeed } from "@/components/alerts-feed"
import { buildAlertFeed } from "@/lib/alert-feed"

export default function AlertsPage() {
  const { events, pipeline } = buildAlertFeed()
  return (
    <AppShell title="Alerts">
      <AlertsFeed events={events} pipeline={pipeline} />
    </AppShell>
  )
}

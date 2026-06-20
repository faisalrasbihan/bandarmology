import { AppShell } from "@/components/app-shell"
import { AlertsView } from "@/components/alerts-view"

export default function AlertsPage() {
  return (
    <AppShell title="Risk Alerts">
      <AlertsView />
    </AppShell>
  )
}

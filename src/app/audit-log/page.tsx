import { AppShell } from "@/components/app-shell"
import { AuditLogView } from "@/components/audit-log-view"

export default function AuditLogPage() {
  return (
    <AppShell title="Audit Log">
      <AuditLogView />
    </AppShell>
  )
}

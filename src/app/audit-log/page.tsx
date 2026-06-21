import { AppShell } from "@/components/app-shell"
import { AuditLogView } from "@/components/audit-log-view"
import { RiskPipeline } from "@/components/risk-pipeline"
import { getPipelineCounts } from "@/lib/pipeline-counts"

export default function AuditLogPage() {
  return (
    <AppShell title="Audit Log">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <RiskPipeline current="closed" counts={getPipelineCounts()} />
        <AuditLogView />
      </div>
    </AppShell>
  )
}

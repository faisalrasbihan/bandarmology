import { AppShell } from "@/components/app-shell"
import { ClientsTable } from "@/components/clients-table"
import { FlaggedAlerts } from "@/components/flagged-alerts"
import { RiskPipeline } from "@/components/risk-pipeline"
import { SectionCards } from "@/components/section-cards"
import { type ClientRecord } from "@/components/client-profile"
import { type Alert } from "@/components/data-table"

import data from "@/app/data.json"

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ priority?: string; view?: string }>
}) {
  const { priority, view } = await searchParams

  return (
    <AppShell title="Clients">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <RiskPipeline current="marked" />
        <SectionCards />
        <FlaggedAlerts data={(data as Alert[]).filter((c) => c.flagged)} />
        <ClientsTable
          clients={data as ClientRecord[]}
          initialPriority={priority}
          initialView={view}
        />
      </div>
    </AppShell>
  )
}

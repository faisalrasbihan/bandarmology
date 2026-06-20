import { AppShell } from "@/components/app-shell"
import { ClientsTable } from "@/components/clients-table"
import { type ClientRecord } from "@/components/client-profile"

import data from "@/app/data.json"

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ priority?: string; view?: string }>
}) {
  const { priority, view } = await searchParams

  return (
    <AppShell title="Clients">
      <ClientsTable
        clients={data as ClientRecord[]}
        initialPriority={priority}
        initialView={view}
      />
    </AppShell>
  )
}

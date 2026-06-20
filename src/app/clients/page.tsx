import { AppShell } from "@/components/app-shell"
import { ClientsTable } from "@/components/clients-table"
import { type ClientRecord } from "@/components/client-profile"

import data from "@/app/data.json"

export default function ClientsPage() {
  return (
    <AppShell title="Clients">
      <ClientsTable clients={data as ClientRecord[]} />
    </AppShell>
  )
}

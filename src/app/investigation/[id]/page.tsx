import { notFound } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { InvestigationView, type InvestigationData } from "@/components/investigation-view"
import { type ClientRecord } from "@/components/client-profile"

import data from "@/app/data.json"
import investigations from "@/app/investigations.json"

export function generateStaticParams() {
  return (data as ClientRecord[]).map((c) => ({ id: `${c.id}` }))
}

export default async function InvestigationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const client = (data as ClientRecord[]).find((c) => `${c.id}` === id)

  if (!client) {
    notFound()
  }

  // The investigation view is snapshotted into investigations.json at build
  // time (keyed by entity name), so this page renders without any live DB call.
  const initialData = (investigations as Record<string, InvestigationData>)[client.client]

  return (
    <AppShell title="Investigation">
      <InvestigationView
        clientId={client.id}
        entityName={client.client}
        severityHint={client.severity}
        initialData={initialData}
      />
    </AppShell>
  )
}

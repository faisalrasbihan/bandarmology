"use client"

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface ExposureEdge {
  id: string
  entityName: string
  tagType: string
  tagValue: string
  source: string
  confidence: number
}

const TAG_LABEL: Record<string, string> = {
  sector: "Sector",
  country: "Country",
  director: "Director",
  supplier: "Supplier",
  customer: "Customer",
  subsidiary: "Subsidiary",
  regulator: "Regulator",
}

/**
 * Layer 1 public exposure graph for a single client — what it's tagged with
 * (sector, country, named directors, suppliers, …) that second-order
 * propagation can later match against incoming public signals. Fetched live
 * since exposure edges aren't baked into the static dashboard snapshot.
 */
export function ExposureTags({ entityName }: { entityName: string }) {
  const [edges, setEdges] = useState<ExposureEdge[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/exposures?entityName=${encodeURIComponent(entityName)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setEdges(d.edges ?? [])
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [entityName])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public Exposure Tags</CardTitle>
        <CardDescription>Layer 1 — sector, jurisdiction, director, supplier/customer links</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="text-destructive text-sm">Failed to load exposure tags.</p>}
        {!error && edges === null && <p className="text-muted-foreground text-sm">Loading…</p>}
        {edges?.length === 0 && (
          <p className="text-muted-foreground text-sm">No public exposure tags recorded for this entity.</p>
        )}
        {edges && edges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {edges.map((e) => (
              <Badge key={e.id} variant="outline" className="gap-1.5 font-normal">
                <span className="text-muted-foreground">{TAG_LABEL[e.tagType] ?? e.tagType}</span>
                {e.tagValue}
                <span className="text-muted-foreground/70 tabular-nums">
                  {(e.confidence * 100).toFixed(0)}%
                </span>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

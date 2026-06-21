import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export interface ExposureTag {
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
 * propagation can later match against incoming public signals. Snapshotted into
 * data.json at build time (see src/server/dashboard), so the client page needs
 * no live DB call and works in any deployment.
 */
export function ExposureTags({ tags = [] }: { tags?: ExposureTag[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Public Exposure Tags</CardTitle>
        <CardDescription>Layer 1 — sector, jurisdiction, director, supplier/customer links</CardDescription>
      </CardHeader>
      <CardContent>
        {tags.length === 0 ? (
          <p className="text-muted-foreground text-sm">No public exposure tags recorded for this entity.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((e, i) => (
              <Badge key={`${e.tagType}-${e.tagValue}-${i}`} variant="outline" className="gap-1.5 font-normal">
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

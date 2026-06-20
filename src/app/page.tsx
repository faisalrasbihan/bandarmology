import { AppShell } from "@/components/app-shell"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { PriorityDonut } from "@/components/priority-donut"
import { RiskPipeline } from "@/components/risk-pipeline"
import { IncomingRisk } from "@/components/incoming-risk"

export default function Page() {
  return (
    <AppShell title="Risk Dashboard">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <RiskPipeline current="incoming" />
        <IncomingRisk />
        <div
          id="risk-trend"
          className="grid scroll-mt-20 grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3"
        >
          <div className="@4xl/main:col-span-2">
            <ChartAreaInteractive />
          </div>
          <PriorityDonut />
        </div>
      </div>
    </AppShell>
  )
}

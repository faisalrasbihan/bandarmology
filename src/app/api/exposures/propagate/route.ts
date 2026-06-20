import { NextRequest, NextResponse } from "next/server";
import { propagateAcrossSignals } from "@/server/exposure";

// POST /api/exposures/propagate[?entity=Name][&limit=N] — run second-order
// exposure propagation. The only LLM-calling endpoint for this feature, so spend
// is a deliberate action (a free text pre-filter keeps the LLM off the long
// tail). `entity` limits the *source* signals scanned; targets are other
// clients. Exposure alerts are created 'proposed' (human-in-the-loop).
export async function POST(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const sourceEntity = sp.get("entity") ?? undefined;
  const limitRaw = sp.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    return NextResponse.json({ error: "limit must be a positive number" }, { status: 400 });
  }

  const result = await propagateAcrossSignals({ sourceEntity, limit });
  return NextResponse.json({
    signalsScanned: result.signalsScanned,
    candidatesEvaluated: result.candidatesEvaluated,
    alertsCreated: result.alerts.length,
    alerts: result.alerts,
  });
}

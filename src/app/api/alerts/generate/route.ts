import { NextRequest, NextResponse } from "next/server";
import { runStage2, submitStage2Batch } from "@/server/classify";

// POST /api/alerts/generate?entityHint=Tesla&limit=10[&mode=batch]
// Runs Stage 2 (LLM classify) over Stage-1-survivor signals that don't yet have
// an alert. The only path in the codebase that calls an LLM — triggered
// explicitly, never automatically on ingest, so cost is always deliberate.
//
// Default mode is synchronous (immediate results, best for the demo). mode=batch
// submits via the Message Batches API (50% cheaper, async) and returns a batchId
// to collect later from POST /api/alerts/batch/:id/collect.
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entityHint = searchParams.get("entityHint") ?? undefined;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  if (searchParams.get("mode") === "batch") {
    const { batchId, submitted } = await submitStage2Batch({ entityHint, limit });
    return NextResponse.json({
      mode: "batch",
      batchId,
      submitted,
      collectAt: batchId ? `/api/alerts/batch/${batchId}/collect` : null,
    });
  }

  const { alerts, skippedNoFlag, skippedWrongEntity, errors } = await runStage2({ entityHint, limit });
  return NextResponse.json({
    mode: "sync",
    created: alerts.length,
    skippedNoFlag,
    skippedWrongEntity,
    alerts,
    errors,
  });
}

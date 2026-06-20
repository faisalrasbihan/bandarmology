import { NextRequest, NextResponse } from "next/server";
import { runStage2 } from "@/server/classify";

// POST /api/alerts/generate?entityHint=Tesla&limit=10
// Runs Stage 2 (LLM classify) over Stage-1-survivor signals that don't yet
// have an alert. This is the only path in the codebase that calls an LLM —
// triggered explicitly, never automatically on ingest, so cost is always a
// deliberate action.
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entityHint = searchParams.get("entityHint") ?? undefined;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const { alerts, skippedNoFlag, errors } = await runStage2({ entityHint, limit });

  return NextResponse.json({
    created: alerts.length,
    skippedNoFlag,
    alerts,
    errors,
  });
}

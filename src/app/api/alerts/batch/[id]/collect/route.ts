import { NextRequest, NextResponse } from "next/server";
import { collectStage2Batch } from "@/server/classify";

// POST /api/alerts/batch/:id/collect — collect a Stage 2 batch submitted with
// ?mode=batch. If the batch hasn't finished, returns its processing_status and
// creates nothing; once "ended", validates each result (same grounding/entity
// guard as the sync path), logs every call, and creates the alerts.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await collectStage2Batch(id);
  return NextResponse.json(result);
}

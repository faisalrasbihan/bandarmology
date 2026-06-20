import { NextResponse } from "next/server";
import { getCostSummary } from "@/server/classify";
import { getTriageStats } from "@/server/filter";

// GET /api/cost-summary — aggregate LLM spend plus the Stage 1 triage breakdown.
// Every Stage 2/3 call is logged via logLlmCall regardless of outcome, so spend
// is accurate; the triage figures show what share of volume the free Stage 1
// filter resolved before any paid call — the "Cost Efficiency" story.
export async function GET() {
  const triage = await getTriageStats();
  const summary = await getCostSummary(triage);
  return NextResponse.json(summary);
}

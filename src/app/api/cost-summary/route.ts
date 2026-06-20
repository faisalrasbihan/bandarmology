import { NextResponse } from "next/server";
import { getCostSummary } from "@/server/classify";

// GET /api/cost-summary — aggregate LLM spend across every logged call.
// Every Stage 2/3 call is logged via logLlmCall regardless of outcome
// (success or schema-validation failure), so this reflects true spend.
export async function GET() {
  const summary = await getCostSummary();
  return NextResponse.json(summary);
}

import { NextResponse } from "next/server";
import { seedExposureEdges } from "@/server/exposure";

// POST /api/exposures/seed — seed the hand-authored public exposure graph for
// the demo book of business. Idempotent. No LLM calls.
export async function POST() {
  const edges = await seedExposureEdges();
  return NextResponse.json({ seeded: edges.length, edges });
}

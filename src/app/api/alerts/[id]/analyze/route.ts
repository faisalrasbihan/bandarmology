import { NextRequest, NextResponse } from "next/server";
import { runStage3 } from "@/server/classify";

// POST /api/alerts/:id/analyze — run Stage 3 deep analysis (KYC drift) for one
// alert. Escalated/rare and higher-cost (Sonnet 4.6), so it's an explicit call,
// not automatic. This is where Layer 1 (the alert + signal) and Layer 2 (the
// KYC baseline) are joined; the LLM call is logged like every other.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { finding, reason } = await runStage3(id);

  if (!finding) {
    // 422: the request was valid but we couldn't produce an analysis (no
    // baseline, missing signal, or validation failure) — reason explains which.
    return NextResponse.json({ error: reason }, { status: 422 });
  }
  return NextResponse.json(finding);
}

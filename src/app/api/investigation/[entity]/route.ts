import { NextRequest, NextResponse } from "next/server";
import { buildInvestigation } from "@/server/investigation";

// GET /api/investigation/:entity — the read-only investigation view for a
// concerning client: internal (Layer 2) + on-chain (Layer 1) activity merged for
// display only, shaped for progressive disclosure (findings → flows → evidence →
// timeline → full-ledger counts). No LLM call; no writes.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const view = await buildInvestigation(decodeURIComponent(entity));
  return NextResponse.json(view);
}

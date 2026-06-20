import { NextRequest, NextResponse } from "next/server";
import { narrateInvestigation } from "@/server/investigation";

// POST /api/investigation/:entity/narrate — optional on-demand LLM summary across
// the internal + on-chain evidence. Grounded to the transaction ids shown;
// token-logged (stage "investigate") via the shared harness, so it rolls into the
// cost metric. Returns the full investigation view with the narrative attached.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const { view, error } = await narrateInvestigation(decodeURIComponent(entity));
  if (error) return NextResponse.json({ error, view }, { status: 422 });
  return NextResponse.json(view);
}

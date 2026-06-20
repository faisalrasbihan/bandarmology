import { NextRequest, NextResponse } from "next/server";
import { narrateFinding } from "@/server/aml";

// POST /api/aml/findings/:id/narrate — optional Stage-2-analog LLM narration.
// Reasons over the flagged transactions + KYC baseline (logged Layer-2 join),
// grounded to the evidence transaction ids; every call is token-logged.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { finding, error } = await narrateFinding(id);
  if (!finding) return NextResponse.json({ error: error ?? "not found" }, { status: 404 });
  if (error) return NextResponse.json({ error, finding }, { status: 422 });
  return NextResponse.json({ finding });
}

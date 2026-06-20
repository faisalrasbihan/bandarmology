import { NextResponse } from "next/server";
import { getBaselines } from "@/server/baseline";

// GET /api/baselines — list the Layer 2 simulated KYC baselines.
export async function GET() {
  const baselines = await getBaselines();
  return NextResponse.json({ count: baselines.length, baselines });
}

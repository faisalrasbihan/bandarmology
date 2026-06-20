import { NextResponse } from "next/server";
import { seedBaselines } from "@/server/baseline";

// POST /api/baselines/seed — load the hand-authored demo KYC baselines
// (idempotent upsert). Convenience for the demo; in a real system baselines
// come from onboarding, not a seed endpoint.
export async function POST() {
  const baselines = await seedBaselines();
  return NextResponse.json({ seeded: baselines.length, baselines });
}

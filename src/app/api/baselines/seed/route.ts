import { NextResponse } from "next/server";
import { seedBaselines, seedClientProfiles } from "@/server/baseline";

// POST /api/baselines/seed — load the hand-authored demo KYC baselines and the
// paired synthetic client profiles (idempotent upserts). Convenience for the
// demo; in a real system these come from onboarding, not a seed endpoint.
export async function POST() {
  const baselines = await seedBaselines();
  const profiles = await seedClientProfiles();
  return NextResponse.json({ baselines: baselines.length, profiles: profiles.length });
}

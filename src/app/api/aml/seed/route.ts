import { NextResponse } from "next/server";
import { seedTransactions } from "@/server/aml";

// POST /api/aml/seed — (re)generate the synthetic Layer 2 transaction feed for
// the seeded book of business. Deterministic and idempotent. No detection runs
// here — call /api/aml/detect afterwards.
export async function POST() {
  const seeded = await seedTransactions();
  return NextResponse.json({ seeded });
}

import { NextResponse } from "next/server";
import { seedOnchainTx } from "@/server/onchain";

// POST /api/onchain/seed — (re)generate the synthetic Layer 1 public-ledger feed
// for the entities with a known wallet address. Deterministic and idempotent.
// Public data — kept entirely separate from the Layer 2 aml_transactions feed.
export async function POST() {
  const seeded = await seedOnchainTx();
  return NextResponse.json({ seeded });
}

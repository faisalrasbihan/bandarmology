import { NextResponse } from "next/server";
import { buildClientRecords } from "@/server/dashboard";

// GET /api/dashboard — the full client book as ClientRecord[] (the exact shape
// the frontend imports from src/app/data.json). Read-only Layer 1 × Layer 2
// join; no LLM calls. Use /api/dashboard/snapshot to persist it to data.json.
export async function GET() {
  const clients = await buildClientRecords();
  return NextResponse.json(clients);
}

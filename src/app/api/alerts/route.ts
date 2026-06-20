import { NextRequest, NextResponse } from "next/server";
import { getAlerts, type AlertStatus } from "@/server/classify";

// GET /api/alerts?entityHint=Tesla&status=proposed
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entityHint = searchParams.get("entityHint") ?? undefined;
  const status = (searchParams.get("status") as AlertStatus | null) ?? undefined;

  const alerts = await getAlerts({ entityHint, status });
  return NextResponse.json({ count: alerts.length, alerts });
}

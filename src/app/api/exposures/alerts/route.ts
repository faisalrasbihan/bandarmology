import { NextRequest, NextResponse } from "next/server";
import { getExposureAlerts, type ExposureAlertStatus } from "@/server/exposure";

const VALID_STATUSES: ExposureAlertStatus[] = ["proposed", "confirmed", "escalated", "dismissed"];

// GET /api/exposures/alerts[?entityName=Name][&status=proposed] — list
// second-order exposure alerts (the alerts raised on a client via an exposure
// link rather than a direct mention).
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const entityName = sp.get("entityName") ?? undefined;
  const status = sp.get("status") ?? undefined;
  if (status && !VALID_STATUSES.includes(status as ExposureAlertStatus)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }
  const alerts = await getExposureAlerts({ entityName, status: status as ExposureAlertStatus | undefined });
  return NextResponse.json({ alerts });
}

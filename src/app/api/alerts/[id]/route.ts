import { NextRequest, NextResponse } from "next/server";
import { setAlertStatus, type AlertStatus } from "@/server/classify";

const VALID_STATUSES: AlertStatus[] = ["proposed", "confirmed", "escalated", "dismissed"];

// PATCH /api/alerts/:id  { "status": "confirmed" }
// The only way an alert leaves "proposed" — an explicit, human-initiated
// call. Nothing in the ingestion or Stage 1/2 pipeline calls this.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { status?: string } | null;
  const status = body?.status;

  if (!status || !VALID_STATUSES.includes(status as AlertStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  await setAlertStatus(id, status as AlertStatus);
  return NextResponse.json({ id, status });
}

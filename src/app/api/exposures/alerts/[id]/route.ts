import { NextRequest, NextResponse } from "next/server";
import {
  getExposureAlertById,
  getExposureAlertDecisions,
  setExposureAlertStatus,
  type ExposureAlertStatus,
} from "@/server/exposure";
import { getSignalsByIds } from "@/server/signals";

const VALID_STATUSES: ExposureAlertStatus[] = ["proposed", "confirmed", "escalated", "dismissed"];

// GET /api/exposures/alerts/:id — one exposure alert with its cited signals and
// full decision history (the Signal → exposure edge → client citation chain).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await getExposureAlertById(id);
  if (!alert) return NextResponse.json({ error: "exposure alert not found" }, { status: 404 });

  const [citations, decisions] = await Promise.all([
    getSignalsByIds(alert.citationSignalIds),
    getExposureAlertDecisions(id),
  ]);
  return NextResponse.json({ ...alert, citations, decisions });
}

// PATCH /api/exposures/alerts/:id { status, actor, note? } — the only way an
// exposure alert leaves 'proposed'. Human-initiated; writes an audit row.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { status?: string; actor?: string; note?: string } | null;
  const status = body?.status;
  const actor = body?.actor?.trim();

  if (!status || !VALID_STATUSES.includes(status as ExposureAlertStatus)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }
  if (!actor) {
    return NextResponse.json({ error: "actor is required — who is making this decision (for the audit log)" }, { status: 400 });
  }

  const changed = await setExposureAlertStatus(id, status as ExposureAlertStatus, actor, body?.note);
  if (!changed) {
    return NextResponse.json({ error: "exposure alert not found, or already in that status" }, { status: 409 });
  }
  return NextResponse.json({ id, status, actor });
}

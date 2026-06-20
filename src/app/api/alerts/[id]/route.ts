import { NextRequest, NextResponse } from "next/server";
import {
  getAlertById,
  getAlertDecisions,
  getDriftFindings,
  setAlertStatus,
  type AlertStatus,
} from "@/server/classify";
import { resolveCitations } from "@/server/classify/citations";

const VALID_STATUSES: AlertStatus[] = ["proposed", "confirmed", "escalated", "dismissed"];

// GET /api/alerts/:id — one alert with resolved citation sources, Stage 3 drift
// findings (if analyzed), and full decision history.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await getAlertById(id);
  if (!alert) {
    return NextResponse.json({ error: "alert not found" }, { status: 404 });
  }
  const [citations, decisions, driftFindings] = await Promise.all([
    resolveCitations(alert.citations),
    getAlertDecisions(id),
    getDriftFindings(id),
  ]);
  return NextResponse.json({ ...alert, resolvedCitations: citations, decisions, driftFindings });
}

// PATCH /api/alerts/:id  { "status": "confirmed", "actor": "analyst@amina", "note": "..." }
// The only way an alert leaves "proposed" — an explicit, human-initiated call.
// Nothing in the ingestion or Stage 1/2/3 pipeline calls this. The status change
// and its audit record (who, from→to, when, note) are written in one transaction.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as
    | { status?: string; actor?: string; note?: string }
    | null;
  const status = body?.status;
  const actor = body?.actor?.trim();

  if (!status || !VALID_STATUSES.includes(status as AlertStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!actor) {
    return NextResponse.json(
      { error: "actor is required — who is making this decision (for the audit log)" },
      { status: 400 }
    );
  }

  const changed = await setAlertStatus(id, status as AlertStatus, actor, body?.note);
  if (!changed) {
    return NextResponse.json(
      { error: "alert not found, or already in that status" },
      { status: 409 }
    );
  }
  return NextResponse.json({ id, status, actor });
}

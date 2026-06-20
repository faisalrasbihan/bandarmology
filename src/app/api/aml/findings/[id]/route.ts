import { NextRequest, NextResponse } from "next/server";
import { getFindingById, getFindingDecisions, getTransactions, setFindingStatus, type AmlStatus } from "@/server/aml";

const VALID_STATUSES: AmlStatus[] = ["proposed", "confirmed", "escalated", "dismissed"];

// GET /api/aml/findings/:id — one finding with its evidence transactions and
// full decision history.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const finding = await getFindingById(id);
  if (!finding) return NextResponse.json({ error: "finding not found" }, { status: 404 });

  const [allTx, decisions] = await Promise.all([getTransactions(finding.entityName), getFindingDecisions(id)]);
  const evidenceIds = new Set(finding.evidenceTxIds);
  const evidence = allTx.filter((t) => evidenceIds.has(t.id));
  return NextResponse.json({ ...finding, evidence, decisions });
}

// PATCH /api/aml/findings/:id { status, actor, note? } — the only way a finding
// leaves 'proposed'. Human-initiated; writes an audit row in one transaction.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { status?: string; actor?: string; note?: string } | null;
  const status = body?.status;
  const actor = body?.actor?.trim();

  if (!status || !VALID_STATUSES.includes(status as AmlStatus)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }
  if (!actor) {
    return NextResponse.json({ error: "actor is required — who is making this decision (for the audit log)" }, { status: 400 });
  }

  const changed = await setFindingStatus(id, status as AmlStatus, actor, body?.note);
  if (!changed) {
    return NextResponse.json({ error: "finding not found, or already in that status" }, { status: 409 });
  }
  return NextResponse.json({ id, status, actor });
}

import { NextRequest, NextResponse } from "next/server";
import { getFindings, type AmlStatus } from "@/server/aml";

// GET /api/aml/findings?entity=Name&status=proposed — list AML findings.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const findings = await getFindings({
    entityName: searchParams.get("entity") ?? undefined,
    status: (searchParams.get("status") as AmlStatus) ?? undefined,
  });
  return NextResponse.json({ count: findings.length, findings });
}

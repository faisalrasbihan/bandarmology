import { NextRequest, NextResponse } from "next/server";
import { ingestSignals, type FetchQuery } from "@/server/signals";

function parseList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const list = value.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

// GET /api/signals?company=Acme%20Corp&aliases=Acme,Acme%20Inc&sectors=fintech&countries=CH&maxResults=10
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyName = searchParams.get("company");

  if (!companyName) {
    return NextResponse.json({ error: "Missing required query param: company" }, { status: 400 });
  }

  const maxResultsParam = searchParams.get("maxResults");
  const query: FetchQuery = {
    companyName,
    aliases: parseList(searchParams.get("aliases")),
    sectors: parseList(searchParams.get("sectors")),
    countries: parseList(searchParams.get("countries")),
    maxResults: maxResultsParam ? Number(maxResultsParam) : undefined,
  };

  const { inserted, duplicates, errors } = await ingestSignals(query);
  const survived = inserted.filter((s) => s.stage1.passed).length;

  return NextResponse.json({
    query,
    count: inserted.length,
    duplicates,
    stage1: { survived, filtered: inserted.length - survived },
    signals: inserted,
    errors,
  });
}

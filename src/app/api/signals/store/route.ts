import { NextRequest, NextResponse } from "next/server";
import { attachStage1Classifications } from "@/server/filter";
import { getStoredSignals } from "@/server/signals";

// GET /api/signals/store?entityHint=Acme%20Corp&stage1=survived
// Lists everything accumulated in the dedupe store across all prior
// /api/signals calls — persisted in Postgres, see src/server/signals/store.ts —
// annotated with each signal's Stage 1 classification (see ../../../server/filter).
// stage1=survived|filtered narrows to just one side of the triage; omit for both.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entityHint = searchParams.get("entityHint") ?? undefined;
  const stage1Filter = searchParams.get("stage1") as "survived" | "filtered" | null;

  const stored = await getStoredSignals(entityHint ? { entityHint } : undefined);
  const classified = await attachStage1Classifications(stored);

  const signals =
    stage1Filter === "survived"
      ? classified.filter((s) => s.stage1.passed)
      : stage1Filter === "filtered"
        ? classified.filter((s) => !s.stage1.passed)
        : classified;

  return NextResponse.json({ count: signals.length, signals });
}

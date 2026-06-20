import { NextRequest, NextResponse } from "next/server";
import { AML_SEED_ENTITIES, runAmlDetection } from "@/server/aml";

// POST /api/aml/detect[?entity=Name] — run the free rule-based detectors over
// the transaction feed. Without ?entity, runs the whole seeded book. Findings
// are created/kept 'proposed' (human-in-the-loop) — never auto-confirmed.
export async function POST(req: NextRequest) {
  const entity = new URL(req.url).searchParams.get("entity");
  const entities = entity ? [entity] : AML_SEED_ENTITIES;

  const results = [];
  for (const name of entities) {
    const findings = await runAmlDetection(name);
    results.push({
      entity: name,
      findings: findings.map((f) => ({ flagType: f.flagType, severity: f.severity, confidence: f.confidence, evidence: f.evidenceTxIds.length })),
    });
  }
  return NextResponse.json({ results });
}

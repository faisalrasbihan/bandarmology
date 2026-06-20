import { NextRequest, NextResponse } from "next/server";
import { getBaselines, seedBaselines, seedClientProfiles } from "@/server/baseline";
import { seedExposureEdges } from "@/server/exposure";
import { seedOnchainTx } from "@/server/onchain";
import { ingestSignals } from "@/server/signals";

/**
 * POST /api/seed — one-shot demo bootstrap:
 *   1. seed Layer 2 KYC baselines + synthetic client profiles
 *   2. seed the Layer 1 public exposure graph (sectors/countries/directors/…)
 *   3. seed the Layer 1 public on-chain feed for entities with known addresses
 *   4. ingest Layer 1 signals for every seeded entity (all fetchers, incl.
 *      Crunchbase funding/registry — synthetic when no CRUNCHBASE_API_KEY),
 *      running each through Stage 1 triage.
 *
 * Per-entity ingest is wrapped so one source/entity failing never aborts the
 * rest (same spirit as fetchAllSignals' Promise.allSettled). No LLM calls are
 * made here — Stage 2/3, exposure propagation, and investigation narration all
 * stay behind their own explicit endpoints so spend remains a deliberate action.
 * The Layer 2 AML feed/detection has its own /api/aml/{seed,detect}. Run
 * /api/dashboard/snapshot afterwards to push the result into data.json.
 */
export async function POST(req: NextRequest) {
  const maxResults = Number(new URL(req.url).searchParams.get("maxResults") ?? 15);

  const baselines = await seedBaselines();
  const profiles = await seedClientProfiles();
  const exposures = await seedExposureEdges();
  const onchain = await seedOnchainTx();

  const entities = await getBaselines();
  const ingest: { entity: string; inserted?: number; duplicates?: number; survived?: number; errors?: string[]; failed?: string }[] = [];

  for (const b of entities) {
    try {
      const { inserted, duplicates, errors } = await ingestSignals({
        companyName: b.companyName,
        sectors: b.expectedSectors,
        countries: b.expectedCountries,
        maxResults,
      });
      ingest.push({
        entity: b.companyName,
        inserted: inserted.length,
        duplicates,
        survived: inserted.filter((s) => s.stage1.passed).length,
        errors: errors.map((e) => `${e.source}: ${e.message}`),
      });
    } catch (err) {
      ingest.push({ entity: b.companyName, failed: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    baselines: baselines.length,
    profiles: profiles.length,
    exposures: exposures.length,
    onchain,
    ingest,
  });
}

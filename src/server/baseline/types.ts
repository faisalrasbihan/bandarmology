/**
 * Layer 2 — simulated internal KYC data. Kept in its own module and Postgres
 * table (`kyc_baselines`), never merged with the Layer 1 `signals` store. The
 * only place Layer 1 and Layer 2 meet is the explicit, logged join in Stage 3
 * (see classify/stage3.ts). This is the data-separation guardrail in CLAUDE.md.
 */

export type RiskRating = "low" | "medium" | "high";

export interface KycBaseline {
  entityId: string;
  /** Matched against a Layer 1 signal's entityHint at the Stage 3 join. */
  companyName: string;
  expectedSectors: string[];
  expectedCountries: string[];
  expectedBusinessModel: string;
  expectedTxVolumeRange: string;
  ownershipStructure: string[];
  riskRating: RiskRating;
  onboardedAt: string;
}

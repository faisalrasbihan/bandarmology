/**
 * Server-side mirror of the frontend `ClientRecord` shape
 * (src/components/client-profile.tsx). Kept structurally identical so the
 * dashboard join can emit the exact JSON the static frontend imports from
 * src/app/data.json — the seam that connects the backend to the unchanged UI.
 * If the frontend type changes, change this in lockstep.
 */
export interface ClientRecord {
  id: number;
  client: string;
  sector: string;
  jurisdiction: string;
  relationship: string;
  flagged: boolean;
  exposureUsd: number;
  severity: string;
  originalRisk: string;
  currentRisk: string;
  riskScore: number;
  riskDelta: number;
  signal: string;
  trigger: string;
  sources: number;
  detected: string;
  status: string;
  kyc: {
    onboarded: string;
    expectedModel: string;
    expectedActivity: string;
    owners: string;
  };
  baseline: string;
  observed: string;
  reasoning: string;
  confidence: number;
  tier: string;
  action: string;
  summary: string;
  riskBreakdown: { type: string; status: string; reason: string }[];
  citations: { source: string; date: string; headline: string }[];
  watchlist?: boolean;
  watchlistMeta?: {
    reason: string;
    addedBy: string;
    addedOn: string;
    reviewBy: string;
  };
}

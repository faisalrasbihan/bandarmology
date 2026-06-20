import { upsertClientProfile, type ClientProfile } from "./profileStore";

/**
 * Synthetic relationship profiles for the seeded entities. Authored to line up
 * with the KYC baselines in seed.ts (same company names) and to make the
 * dashboard's exposure / watchlist / relationship columns meaningful. Not real
 * AMINA data — see profileStore.ts for why this layer exists.
 */
const SEED: Omit<ClientProfile, "entityId">[] = [
  {
    companyName: "Wirecard",
    relationship: "Custody",
    exposureUsd: 180_000_000,
    displaySector: "Payments / Fintech",
    jurisdiction: "Germany",
    relationshipManager: "L. Brandt",
    watchlist: true,
    watchlistMeta: {
      reason: "Adverse media on accounting irregularities; pending enhanced due diligence.",
      addedBy: "Compliance — M. Roth",
      addedOn: "2026-06-15",
      reviewBy: "2026-07-15",
    },
  },
  {
    companyName: "Binance",
    relationship: "Trading",
    exposureUsd: 320_000_000,
    displaySector: "Crypto / Exchange",
    jurisdiction: "Malta",
    relationshipManager: "S. Keller",
    watchlist: true,
    watchlistMeta: {
      reason: "Multi-jurisdiction regulatory scrutiny of crypto exchanges.",
      addedBy: "Compliance — M. Roth",
      addedOn: "2026-06-10",
      reviewBy: "2026-07-10",
    },
  },
  {
    companyName: "Tesla",
    relationship: "Lending",
    exposureUsd: 540_000_000,
    displaySector: "Automotive / Energy",
    jurisdiction: "United States",
    relationshipManager: "A. Vogt",
    watchlist: false,
    watchlistMeta: null,
  },
  {
    companyName: "Nestle",
    relationship: "Advisory",
    exposureUsd: 410_000_000,
    displaySector: "Consumer Goods / Food & Beverage",
    jurisdiction: "Switzerland",
    relationshipManager: "C. Frei",
    watchlist: false,
    watchlistMeta: null,
  },
  {
    companyName: "Lindenhof Holdings AG",
    relationship: "Custody",
    exposureUsd: 12_000_000,
    displaySector: "Holding / Investment",
    jurisdiction: "Switzerland",
    relationshipManager: "C. Frei",
    watchlist: false,
    watchlistMeta: null,
  },
];

export async function seedClientProfiles(): Promise<ClientProfile[]> {
  const results: ClientProfile[] = [];
  for (const p of SEED) {
    results.push(await upsertClientProfile(p));
  }
  return results;
}

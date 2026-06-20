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
  // ── Additional demo entities (paired with seed.ts baselines) ─────────────────
  {
    companyName: "FTX Trading Ltd",
    relationship: "Trading",
    exposureUsd: 90_000_000,
    displaySector: "Crypto / Exchange",
    jurisdiction: "Bahamas",
    relationshipManager: "S. Keller",
    watchlist: true,
    watchlistMeta: {
      reason: "Exchange collapse and fraud proceedings; assets frozen pending estate resolution.",
      addedBy: "Compliance — M. Roth",
      addedOn: "2026-06-12",
      reviewBy: "2026-07-12",
    },
  },
  {
    companyName: "Wells Fargo & Co",
    relationship: "Correspondent",
    exposureUsd: 760_000_000,
    displaySector: "Banking / Financial Services",
    jurisdiction: "United States",
    relationshipManager: "A. Vogt",
    watchlist: false,
    watchlistMeta: null,
  },
  {
    companyName: "Danske Bank A/S",
    relationship: "Correspondent",
    exposureUsd: 480_000_000,
    displaySector: "Banking / Financial Services",
    jurisdiction: "Denmark",
    relationshipManager: "L. Brandt",
    watchlist: true,
    watchlistMeta: {
      reason: "Historic Estonia-branch AML failures; non-resident flows under enhanced review.",
      addedBy: "Compliance — M. Roth",
      addedOn: "2026-06-09",
      reviewBy: "2026-07-09",
    },
  },
  {
    companyName: "Glencore plc",
    relationship: "Trading",
    exposureUsd: 610_000_000,
    displaySector: "Commodities / Mining",
    jurisdiction: "Switzerland",
    relationshipManager: "C. Frei",
    watchlist: false,
    watchlistMeta: null,
  },
  {
    companyName: "Evergrande Group",
    relationship: "Lending",
    exposureUsd: 230_000_000,
    displaySector: "Real Estate / Construction",
    jurisdiction: "China",
    relationshipManager: "A. Vogt",
    watchlist: true,
    watchlistMeta: {
      reason: "Winding-up order and liquidation; cross-default risk across group entities.",
      addedBy: "Compliance — M. Roth",
      addedOn: "2026-06-05",
      reviewBy: "2026-07-05",
    },
  },
  {
    companyName: "NSO Group",
    relationship: "Advisory",
    exposureUsd: 45_000_000,
    displaySector: "Technology / Cybersecurity",
    jurisdiction: "Israel",
    relationshipManager: "S. Keller",
    watchlist: true,
    watchlistMeta: {
      reason: "US Entity List designation and export-control exposure; product-misuse allegations.",
      addedBy: "Compliance — M. Roth",
      addedOn: "2026-06-07",
      reviewBy: "2026-07-07",
    },
  },
  {
    companyName: "Orion Bay Trading FZE",
    relationship: "Custody",
    exposureUsd: 28_000_000,
    displaySector: "Trading / General Trading",
    jurisdiction: "United Arab Emirates",
    relationshipManager: "C. Frei",
    watchlist: true,
    watchlistMeta: {
      reason: "Opaque nominee ownership in a high-risk free zone; possible PEP association.",
      addedBy: "Compliance — M. Roth",
      addedOn: "2026-06-01",
      reviewBy: "2026-07-01",
    },
  },
];

export async function seedClientProfiles(): Promise<ClientProfile[]> {
  const results: ClientProfile[] = [];
  for (const p of SEED) {
    results.push(await upsertClientProfile(p));
  }
  return results;
}

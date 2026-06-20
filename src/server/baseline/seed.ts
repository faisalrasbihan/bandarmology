import { upsertBaseline } from "./store";
import type { KycBaseline } from "./types";

/**
 * Hand-authored simulated KYC baselines — "as if AMINA had onboarded these
 * entities." Authored to make drift detectable against the public signals the
 * demo ingests (e.g. Wirecard onboarded as a healthy payments firm, so the
 * fraud/insolvency news is a stark drift). Not real AMINA data.
 */
const SEED: Omit<KycBaseline, "entityId">[] = [
  {
    companyName: "Wirecard",
    expectedSectors: ["payments", "fintech"],
    expectedCountries: ["DE"],
    expectedBusinessModel: "Listed digital-payments processor and card issuer, DAX-30 constituent.",
    expectedTxVolumeRange: "EUR 50M–200M / month, consistent with a large payments processor",
    ownershipStructure: ["Publicly listed (Frankfurt)", "Markus Braun (CEO, significant holding)"],
    riskRating: "medium",
    onboardedAt: "2019-01-15T00:00:00.000Z",
  },
  {
    companyName: "Binance",
    expectedSectors: ["crypto", "exchange"],
    expectedCountries: ["MT", "KY"],
    expectedBusinessModel: "Global cryptocurrency exchange and custodial wallet provider.",
    expectedTxVolumeRange: "High-volume crypto flows; expected given exchange business",
    ownershipStructure: ["Privately held", "Changpeng Zhao (founder, majority)"],
    riskRating: "high",
    onboardedAt: "2021-06-01T00:00:00.000Z",
  },
  {
    companyName: "Tesla",
    expectedSectors: ["automotive", "energy"],
    expectedCountries: ["US"],
    expectedBusinessModel: "Electric-vehicle manufacturer and energy-storage company.",
    expectedTxVolumeRange: "Large industrial supplier/customer flows, USD",
    ownershipStructure: ["Publicly listed (NASDAQ)", "Elon Musk (significant holding)"],
    riskRating: "low",
    onboardedAt: "2022-03-10T00:00:00.000Z",
  },
  {
    companyName: "Nestle",
    expectedSectors: ["consumer_goods", "food_beverage"],
    expectedCountries: ["CH"],
    expectedBusinessModel: "Multinational food and beverage manufacturer.",
    expectedTxVolumeRange: "Stable, high-volume global trade flows, multi-currency",
    ownershipStructure: ["Publicly listed (SIX Swiss Exchange)", "Widely held"],
    riskRating: "low",
    onboardedAt: "2020-11-20T00:00:00.000Z",
  },
];

export async function seedBaselines(): Promise<KycBaseline[]> {
  const results: KycBaseline[] = [];
  for (const b of SEED) {
    results.push(await upsertBaseline(b));
  }
  return results;
}

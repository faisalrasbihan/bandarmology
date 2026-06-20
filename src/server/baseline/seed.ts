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
  {
    // Synthetic shell entity (not a real company) — onboarded as a quiet holding
    // vehicle so the AML transaction layer can demonstrate a dormancy-break flag
    // that the news/KYC-drift pipeline could never see (no public footprint).
    companyName: "Lindenhof Holdings AG",
    expectedSectors: ["holding", "investment"],
    expectedCountries: ["CH"],
    expectedBusinessModel: "Passive Swiss holding company for a family investment portfolio.",
    expectedTxVolumeRange: "Near-zero; occasional small administrative payments only",
    ownershipStructure: ["Privately held", "Single beneficial owner (family trust)"],
    riskRating: "low",
    onboardedAt: "2021-09-05T00:00:00.000Z",
  },
  // ── Additional demo entities ────────────────────────────────────────────────
  // Authored to broaden the book across flag types (financial distress,
  // sanctions, regulatory action, jurisdiction risk) and severity levels so the
  // dashboard shows a realistic distribution. As above, each baseline is written
  // so the seeded Layer 1 signals read as a clear drift from the onboarding
  // profile. Not real AMINA data.
  {
    companyName: "FTX Trading Ltd",
    expectedSectors: ["crypto", "exchange"],
    expectedCountries: ["BS"],
    expectedBusinessModel: "Cryptocurrency exchange and derivatives trading platform.",
    expectedTxVolumeRange: "High-volume crypto and fiat flows, consistent with an exchange",
    ownershipStructure: ["Privately held", "Founder-controlled (single significant holder)"],
    riskRating: "high",
    onboardedAt: "2022-01-20T00:00:00.000Z",
  },
  {
    companyName: "Wells Fargo & Co",
    expectedSectors: ["banking", "financial_services"],
    expectedCountries: ["US"],
    expectedBusinessModel: "Diversified retail and commercial bank.",
    expectedTxVolumeRange: "Very high-volume USD correspondent flows",
    ownershipStructure: ["Publicly listed (NYSE)", "Widely held"],
    riskRating: "medium",
    onboardedAt: "2019-05-12T00:00:00.000Z",
  },
  {
    companyName: "Danske Bank A/S",
    expectedSectors: ["banking", "financial_services"],
    expectedCountries: ["DK", "EE"],
    expectedBusinessModel: "Nordic universal bank with Baltic branch operations.",
    expectedTxVolumeRange: "High-volume EUR/DKK cross-border flows",
    ownershipStructure: ["Publicly listed (Nasdaq Copenhagen)", "Widely held"],
    riskRating: "medium",
    onboardedAt: "2018-11-03T00:00:00.000Z",
  },
  {
    companyName: "Glencore plc",
    expectedSectors: ["commodities", "mining"],
    expectedCountries: ["CH", "JE"],
    expectedBusinessModel: "Commodity trading and mining group.",
    expectedTxVolumeRange: "Very high-value commodity settlement flows, multi-currency",
    ownershipStructure: ["Publicly listed (LSE)", "Widely held"],
    riskRating: "medium",
    onboardedAt: "2020-02-18T00:00:00.000Z",
  },
  {
    companyName: "Evergrande Group",
    expectedSectors: ["real_estate", "construction"],
    expectedCountries: ["CN", "KY"],
    expectedBusinessModel: "Property developer and construction group.",
    expectedTxVolumeRange: "Large CNY/USD construction and financing flows",
    ownershipStructure: ["Publicly listed (HKEX)", "Founder-controlled (majority holder)"],
    riskRating: "high",
    onboardedAt: "2021-04-08T00:00:00.000Z",
  },
  {
    companyName: "NSO Group",
    expectedSectors: ["technology", "cybersecurity"],
    expectedCountries: ["IL"],
    expectedBusinessModel: "Cyber-intelligence and surveillance software vendor.",
    expectedTxVolumeRange: "Moderate USD/EUR enterprise contract flows",
    ownershipStructure: ["Privately held", "Investor consortium"],
    riskRating: "high",
    onboardedAt: "2021-12-01T00:00:00.000Z",
  },
  {
    // Synthetic shell entity (not a real company) — a free-zone trading vehicle
    // with opaque, nominee ownership, used to demonstrate jurisdiction/PEP risk
    // surfacing from public registries rather than the AML transaction layer.
    companyName: "Orion Bay Trading FZE",
    expectedSectors: ["trading", "general_trading"],
    expectedCountries: ["AE"],
    expectedBusinessModel: "General trading company registered in a UAE free zone.",
    expectedTxVolumeRange: "Moderate, irregular cross-border flows",
    ownershipStructure: ["Privately held", "Nominee director (corporate services provider)"],
    riskRating: "high",
    onboardedAt: "2023-03-15T00:00:00.000Z",
  },
];

export async function seedBaselines(): Promise<KycBaseline[]> {
  const results: KycBaseline[] = [];
  for (const b of SEED) {
    results.push(await upsertBaseline(b));
  }
  return results;
}

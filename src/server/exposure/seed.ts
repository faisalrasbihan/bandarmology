import { upsertExposureEdges, type ExposureEdgeInput } from "./store";
import type { ExposureEdge } from "./types";

/**
 * Hand-seeded PUBLIC exposure edges for the demo book of business. These are all
 * public facts (sector/jurisdiction from the onboarding questionnaire, named
 * directors and regulators from registries/news). Beneficial ownership is
 * deliberately absent — that's Layer 2 (KycBaseline.ownershipStructure).
 *
 * The cross-links are what make second-order propagation demonstrable: "Markus
 * Braun" is a director of Wirecard AND of the synthetic shell Lindenhof Holdings
 * AG, so adverse media about Braun (ingested while monitoring Wirecard) raises an
 * exposure alert on Lindenhof — a client with no public footprint of its own.
 */
const SEED: ExposureEdgeInput[] = [
  // Wirecard
  { entityName: "Wirecard", tagType: "sector", tagValue: "payments", source: "onboarding", confidence: 1 },
  { entityName: "Wirecard", tagType: "country", tagValue: "DE", source: "onboarding", confidence: 1 },
  { entityName: "Wirecard", tagType: "director", tagValue: "Markus Braun", source: "registry", confidence: 1 },
  { entityName: "Wirecard", tagType: "regulator", tagValue: "BaFin", source: "registry", confidence: 1 },

  // Binance
  { entityName: "Binance", tagType: "sector", tagValue: "crypto", source: "onboarding", confidence: 1 },
  { entityName: "Binance", tagType: "country", tagValue: "MT", source: "onboarding", confidence: 1 },
  { entityName: "Binance", tagType: "director", tagValue: "Changpeng Zhao", source: "registry", confidence: 1 },
  { entityName: "Binance", tagType: "regulator", tagValue: "CFTC", source: "registry", confidence: 1 },

  // Tesla
  { entityName: "Tesla", tagType: "sector", tagValue: "automotive", source: "onboarding", confidence: 1 },
  { entityName: "Tesla", tagType: "country", tagValue: "US", source: "onboarding", confidence: 1 },
  { entityName: "Tesla", tagType: "director", tagValue: "Elon Musk", source: "registry", confidence: 1 },

  // Nestle
  { entityName: "Nestle", tagType: "sector", tagValue: "consumer_goods", source: "onboarding", confidence: 1 },
  { entityName: "Nestle", tagType: "country", tagValue: "CH", source: "onboarding", confidence: 1 },
  { entityName: "Nestle", tagType: "director", tagValue: "Mark Schneider", source: "registry", confidence: 1 },

  // Lindenhof Holdings AG — synthetic shell. The Braun cross-link is the
  // propagation hook; it has no public footprint of its own.
  { entityName: "Lindenhof Holdings AG", tagType: "sector", tagValue: "holding", source: "onboarding", confidence: 1 },
  { entityName: "Lindenhof Holdings AG", tagType: "country", tagValue: "CH", source: "onboarding", confidence: 1 },
  { entityName: "Lindenhof Holdings AG", tagType: "director", tagValue: "Markus Braun", source: "registry", confidence: 0.9 },
];

export async function seedExposureEdges(): Promise<ExposureEdge[]> {
  return upsertExposureEdges(SEED);
}

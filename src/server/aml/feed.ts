import { randomUUID } from "crypto";
import { replaceTransactions } from "./store";
import type { Transaction, TxChannel, TxDirection } from "./types";

/**
 * Deterministic synthetic transaction generator. Each entity gets ~90 days of
 * "normal" activity consistent with its KYC baseline, plus — for three of them —
 * an injected anomaly window that the detectors in detect.ts are tuned to catch:
 *
 *   Binance   → money-mule cross-border spike (burst of large inbound crypto)
 *   Wirecard  → structuring (many outbound wires just under the $10k threshold)
 *   Lindenhof → dormancy break (near-zero for months, then a sudden large burst)
 *
 * Tesla and Nestle get clean baselines and should produce no findings — they are
 * the false-positive controls. Output is fully deterministic per entity name so
 * re-seeding is idempotent and the demo is reproducible.
 */

const NOW = new Date("2026-06-20T12:00:00.000Z").getTime();
const DAY = 86_400_000;

/** mulberry32 PRNG — seeded per entity for reproducible feeds. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const dayAgo = (n: number, frac = 0.5) => new Date(NOW - (n - frac) * DAY).toISOString();

type AnomalyType = "money_mule" | "structuring" | "dormancy" | "none";

interface EntityConfig {
  homeCountry: string;
  channel: TxChannel;
  /** normal background transactions per day (Poisson-ish, via rng). */
  dailyCount: number;
  /** normal per-transaction amount band [min,max] USD. */
  amount: [number, number];
  /** fraction of normal transactions that are cross-border. */
  crossBorderRatio: number;
  anomaly: AnomalyType;
}

const CONFIG: Record<string, EntityConfig> = {
  binance: { homeCountry: "MT", channel: "crypto", dailyCount: 6, amount: [20_000, 120_000], crossBorderRatio: 0.6, anomaly: "money_mule" },
  wirecard: { homeCountry: "DE", channel: "wire", dailyCount: 4, amount: [15_000, 80_000], crossBorderRatio: 0.3, anomaly: "structuring" },
  tesla: { homeCountry: "US", channel: "wire", dailyCount: 5, amount: [50_000, 400_000], crossBorderRatio: 0.4, anomaly: "none" },
  nestle: { homeCountry: "CH", channel: "sepa", dailyCount: 5, amount: [40_000, 300_000], crossBorderRatio: 0.5, anomaly: "none" },
  "lindenhof holdings ag": { homeCountry: "CH", channel: "wire", dailyCount: 0, amount: [2_000, 6_000], crossBorderRatio: 0.2, anomaly: "dormancy" },
};

const DEFAULT_CONFIG: EntityConfig = {
  homeCountry: "CH",
  channel: "wire",
  dailyCount: 4,
  amount: [20_000, 150_000],
  crossBorderRatio: 0.35,
  anomaly: "none",
};

const NORMAL_COUNTRIES = ["US", "GB", "DE", "FR", "CH", "NL", "SG", "JP"];
const HIGH_RISK_COUNTRIES = ["RU", "KY", "SC", "AE", "PA", "CY", "VG"];
const NORMAL_CPS = ["Acme Components", "Riverside Logistics", "Orion Supplies", "Meridian Partners", "Lakeside Holdings", "Vertex Services", "Crestline Co"];

function pick<T>(r: () => number, arr: T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

function tx(
  entityName: string,
  ts: string,
  amountUsd: number,
  direction: TxDirection,
  counterparty: string,
  counterpartyCountry: string,
  homeCountry: string,
  channel: TxChannel
): Transaction {
  return {
    id: randomUUID(),
    entityName,
    ts,
    amountUsd: Math.round(amountUsd),
    direction,
    counterparty,
    counterpartyCountry,
    crossBorder: counterpartyCountry !== homeCountry,
    channel,
    synthetic: true,
  };
}

export function generateTransactions(entityName: string): Transaction[] {
  const cfg = CONFIG[entityName.toLowerCase()] ?? DEFAULT_CONFIG;
  const r = rng(hash(entityName));
  const out: Transaction[] = [];

  // --- normal background (90 days) ---
  for (let d = 90; d >= 0; d--) {
    // Dormant entities have almost no background activity.
    const count = cfg.dailyCount === 0 ? (r() < 0.05 ? 1 : 0) : Math.round(cfg.dailyCount * (0.5 + r()));
    for (let i = 0; i < count; i++) {
      const crossBorder = r() < cfg.crossBorderRatio;
      const country = crossBorder ? pick(r, NORMAL_COUNTRIES.filter((c) => c !== cfg.homeCountry)) : cfg.homeCountry;
      const amount = cfg.amount[0] + r() * (cfg.amount[1] - cfg.amount[0]);
      const direction: TxDirection = r() < 0.5 ? "inbound" : "outbound";
      out.push(tx(entityName, dayAgo(d, r()), amount, direction, pick(r, NORMAL_CPS), country, cfg.homeCountry, cfg.channel));
    }
  }

  // --- injected anomaly ---
  if (cfg.anomaly === "money_mule") {
    // 12 large inbound cross-border transfers in a 5-day window, each from a
    // distinct, previously-unseen high-risk-jurisdiction counterparty.
    for (let i = 0; i < 12; i++) {
      const amount = 250_000 + r() * 650_000;
      const day = 18 - Math.floor(r() * 5);
      out.push(
        tx(entityName, dayAgo(day, r()), amount, "inbound", `Shell Entity ${String.fromCharCode(65 + i)}`, pick(r, HIGH_RISK_COUNTRIES), cfg.homeCountry, "crypto")
      );
    }
  } else if (cfg.anomaly === "structuring") {
    // 16 outbound wires just under the $10k reporting threshold over ~7 days.
    const cps = ["Northbridge Ltd", "Kestrel Trading", "Aurelia GmbH", "Pelham Services"];
    for (let i = 0; i < 16; i++) {
      const amount = 9_100 + r() * 850; // 9,100–9,950
      const day = 16 - Math.floor(r() * 7);
      out.push(tx(entityName, dayAgo(day, r()), amount, "outbound", pick(r, cps), cfg.homeCountry, cfg.homeCountry, "wire"));
    }
  } else if (cfg.anomaly === "dormancy") {
    // A few tiny administrative payments spread across ~3 months establish a
    // long, well-defined dormant baseline...
    for (const d of [86, 62, 38, 16]) {
      const amount = 2_000 + r() * 4_000;
      out.push(tx(entityName, dayAgo(d, r()), amount, r() < 0.5 ? "inbound" : "outbound", "Admin / Registrar", cfg.homeCountry, cfg.homeCountry, "sepa"));
    }
    // ...then a sudden burst of large transfers in the last 8 days.
    for (let i = 0; i < 6; i++) {
      const amount = 1_200_000 + r() * 1_800_000;
      const day = 8 - Math.floor(r() * 8);
      const crossBorder = r() < 0.6;
      const country = crossBorder ? pick(r, [...HIGH_RISK_COUNTRIES, "AE", "SG"]) : cfg.homeCountry;
      out.push(tx(entityName, dayAgo(day, r()), amount, r() < 0.5 ? "inbound" : "outbound", `Cross-Holding ${i + 1}`, country, cfg.homeCountry, "wire"));
    }
  }

  return out.sort((a, b) => a.ts.localeCompare(b.ts));
}

/** Entity names that get a synthetic feed (the seeded book of business). */
export const AML_SEED_ENTITIES = ["Wirecard", "Binance", "Tesla", "Nestle", "Lindenhof Holdings AG"];

export async function seedTransactions(entities: string[] = AML_SEED_ENTITIES): Promise<{ entity: string; count: number }[]> {
  const results: { entity: string; count: number }[] = [];
  for (const name of entities) {
    const txns = generateTransactions(name);
    const count = await replaceTransactions(name, txns);
    results.push({ entity: name, count });
  }
  return results;
}

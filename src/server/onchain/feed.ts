import { randomUUID } from "crypto";
import { addressesFor, ONCHAIN_SEED_ENTITIES } from "./addresses";
import { replaceOnchainTx } from "./store";
import type { OnchainDirection, OnchainTx } from "./types";

/**
 * Deterministic synthetic public-ledger feed. Each entity with a known address
 * gets ~90 days of "normal" on-chain activity, plus — for the entities that also
 * carry an internal AML anomaly — an on-chain anomaly in the SAME window, so the
 * investigation view can show the public ledger corroborating the internal flag:
 *
 *   Binance   → inbound from a sanctioned mixer in the money-mule window
 *   Lindenhof → large inbound from unattributed/high-risk addresses in the
 *               dormancy-break window
 *
 * Wirecard gets a clean on-chain footprint (its risk is off-chain). Output is
 * deterministic per entity so re-seeding is idempotent.
 */

const NOW = new Date("2026-06-20T12:00:00.000Z").getTime();
const DAY = 86_400_000;

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
const txHash = (r: () => number) =>
  "0x" + Array.from({ length: 16 }, () => Math.floor(r() * 16).toString(16)).join("");

type OnchainAnomaly = "mixer_inflow" | "dormant_inflow" | "none";

interface OnchainConfig {
  asset: string;
  dailyCount: number;
  amount: [number, number];
  anomaly: OnchainAnomaly;
}

const CONFIG: Record<string, OnchainConfig> = {
  binance: { asset: "ETH", dailyCount: 3, amount: [10_000, 90_000], anomaly: "mixer_inflow" },
  wirecard: { asset: "USDT", dailyCount: 1, amount: [5_000, 30_000], anomaly: "none" },
  "lindenhof holdings ag": { asset: "ETH", dailyCount: 0, amount: [1_000, 4_000], anomaly: "dormant_inflow" },
};

const NORMAL_LABELS = ["Coinbase (hot wallet)", "Kraken", "Uniswap router", "Unknown wallet", null];

function randomAddr(r: () => number): string {
  return "0x" + Array.from({ length: 40 }, () => Math.floor(r() * 16).toString(16)).join("");
}

function pick<T>(r: () => number, arr: T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

function makeTx(
  entityName: string,
  address: string,
  chain: string,
  asset: string,
  ts: string,
  amountUsd: number,
  direction: OnchainDirection,
  counterpartyAddress: string,
  counterpartyLabel: string | null,
  riskFlag: string | null,
  r: () => number
): OnchainTx {
  return {
    id: randomUUID(),
    entityName,
    address,
    chain,
    ts,
    asset,
    amountUsd: Math.round(amountUsd),
    direction,
    counterpartyAddress,
    counterpartyLabel,
    riskFlag,
    txHash: txHash(r),
    synthetic: true,
  };
}

export function generateOnchainTx(entityName: string): OnchainTx[] {
  const addrs = addressesFor(entityName);
  if (!addrs.length) return [];
  const { chain, address } = addrs[0];
  const cfg = CONFIG[entityName.toLowerCase()] ?? { asset: "ETH", dailyCount: 1, amount: [5_000, 40_000], anomaly: "none" as OnchainAnomaly };
  const r = rng(hash(`onchain:${entityName}`));
  const out: OnchainTx[] = [];

  // --- normal background (90 days) ---
  for (let d = 90; d >= 0; d--) {
    const count = cfg.dailyCount === 0 ? (r() < 0.04 ? 1 : 0) : Math.round(cfg.dailyCount * (0.5 + r()));
    for (let i = 0; i < count; i++) {
      const amount = cfg.amount[0] + r() * (cfg.amount[1] - cfg.amount[0]);
      const direction: OnchainDirection = r() < 0.5 ? "inbound" : "outbound";
      out.push(
        makeTx(entityName, address, chain, cfg.asset, dayAgo(d, r()), amount, direction, randomAddr(r), pick(r, NORMAL_LABELS), null, r)
      );
    }
  }

  // --- injected anomaly, aligned to the internal AML window ---
  if (cfg.anomaly === "mixer_inflow") {
    // Inbound from a sanctioned mixer during the money-mule window (~days 14–18).
    for (let i = 0; i < 8; i++) {
      const amount = 180_000 + r() * 520_000;
      const day = 18 - Math.floor(r() * 5);
      out.push(
        makeTx(entityName, address, chain, cfg.asset, dayAgo(day, r()), amount, "inbound", randomAddr(r), "Tornado Cash (sanctioned mixer)", "sanctioned", r)
      );
    }
  } else if (cfg.anomaly === "dormant_inflow") {
    // Large inbound from unattributed/high-risk addresses in the dormancy window (last 8 days).
    for (let i = 0; i < 5; i++) {
      const amount = 900_000 + r() * 1_400_000;
      const day = 8 - Math.floor(r() * 8);
      out.push(
        makeTx(entityName, address, chain, cfg.asset, dayAgo(day, r()), amount, "inbound", randomAddr(r), "Unattributed high-risk cluster", "mixer", r)
      );
    }
  }

  return out.sort((a, b) => a.ts.localeCompare(b.ts));
}

export async function seedOnchainTx(entities: string[] = ONCHAIN_SEED_ENTITIES): Promise<{ entity: string; count: number }[]> {
  const results: { entity: string; count: number }[] = [];
  for (const name of entities) {
    const txns = generateOnchainTx(name);
    const count = await replaceOnchainTx(name, txns);
    results.push({ entity: name, count });
  }
  return results;
}

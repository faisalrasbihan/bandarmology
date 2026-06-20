import { getTransactions, upsertFinding } from "./store";
import { AML_FLAG_ACTION, type AmlFinding, type AmlFlagType, type AmlSeverity, type Transaction } from "./types";

/**
 * Stage-1-analog AML detection: free, deterministic statistical rules over an
 * entity's own transaction history (Layer 2 only — no public signal is read).
 * Each rule emits a grounded finding citing the exact transactions that
 * triggered it, with the metrics behind the decision exposed for
 * explainability. The optional LLM narration step (narrate.ts) layers reasoning
 * on top; detection itself stays cheap, which is the point of the staged design.
 */

const DAY = 86_400_000;
const DETECTOR = "rules:aml-v1";

/** The bank's own higher-risk jurisdiction list (domain knowledge, not the feed's). */
const HIGH_RISK_JURISDICTIONS = new Set(["RU", "KY", "SC", "AE", "PA", "CY", "VG", "BVI"]);

const SEVERITY_CONFIDENCE: Record<AmlSeverity, number> = { critical: 0.95, high: 0.88, medium: 0.75, low: 0.6 };

const ms = (t: Transaction) => new Date(t.ts).getTime();
const sum = (txns: Transaction[]) => txns.reduce((a, t) => a + t.amountUsd, 0);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const spanDays = (txns: Transaction[]) =>
  txns.length < 2 ? 0 : Math.max(1, Math.round((ms(txns[txns.length - 1]) - ms(txns[0])) / DAY));

/** Densest time-window subset of `items` no longer than `windowMs`, by count. */
function bestWindow(items: Transaction[], windowMs: number): Transaction[] {
  if (!items.length) return [];
  const sorted = items.slice().sort((a, b) => ms(a) - ms(b));
  let best: Transaction[] = [];
  let l = 0;
  for (let r = 0; r < sorted.length; r++) {
    while (ms(sorted[r]) - ms(sorted[l]) > windowMs) l++;
    const w = sorted.slice(l, r + 1);
    if (w.length > best.length) best = w;
  }
  return best;
}

/**
 * Highest-*value* window no longer than `windowMs` (two-pointer with running
 * sum). A money-mule spike concentrates value, not transaction count — a count
 * window would prefer a dense run of small normal payments and miss the spike.
 */
function bestWindowByValue(items: Transaction[], windowMs: number): Transaction[] {
  if (!items.length) return [];
  const sorted = items.slice().sort((a, b) => ms(a) - ms(b));
  let best: Transaction[] = [];
  let bestSum = -1;
  let sum = 0;
  let l = 0;
  for (let r = 0; r < sorted.length; r++) {
    sum += sorted[r].amountUsd;
    while (ms(sorted[r]) - ms(sorted[l]) > windowMs) {
      sum -= sorted[l].amountUsd;
      l++;
    }
    if (sum > bestSum) {
      bestSum = sum;
      best = sorted.slice(l, r + 1);
    }
  }
  return best;
}

interface Candidate {
  flagType: AmlFlagType;
  severity: AmlSeverity;
  evidence: Transaction[];
  metrics: Record<string, number | string>;
  rationale: string;
}

// --- Structuring / layering ---------------------------------------------------
const STRUCT_THRESHOLD = 10_000;
const STRUCT_BAND_LOW = 9_000;

function detectStructuring(txns: Transaction[]): Candidate | null {
  const candidates = txns.filter(
    (t) => t.direction === "outbound" && t.amountUsd >= STRUCT_BAND_LOW && t.amountUsd < STRUCT_THRESHOLD
  );
  const window = bestWindow(candidates, 21 * DAY);
  if (window.length < 6) return null;

  const days = spanDays(window);
  const total = sum(window);
  const min = Math.min(...window.map((t) => t.amountUsd));
  const max = Math.max(...window.map((t) => t.amountUsd));
  const severity: AmlSeverity = window.length >= 12 ? "high" : "medium";
  return {
    flagType: "structuring_layering",
    severity,
    evidence: window,
    metrics: { transactions: window.length, totalUsd: total, windowDays: days, threshold: STRUCT_THRESHOLD, minAmountUsd: min, maxAmountUsd: max },
    rationale:
      `${window.length} outbound transfers between ${usd(min)} and ${usd(max)} — each just below the ` +
      `${usd(STRUCT_THRESHOLD)} reporting threshold — were sent within ${days} days (total ${usd(total)}). ` +
      `Clustering of just-under-threshold payments is a classic structuring/layering pattern intended to avoid mandatory reporting.`,
  };
}

// --- Money mule / cross-border behavioural anomaly ----------------------------
function detectMoneyMule(txns: Transaction[]): Candidate | null {
  const crossInbound = txns.filter((t) => t.direction === "inbound" && t.crossBorder);
  if (crossInbound.length < 6) return null;

  const window = bestWindowByValue(crossInbound, 7 * DAY);
  if (window.length < 6) return null;

  const distinct = new Set(window.map((t) => t.counterparty)).size;
  const peakUsd = sum(window);
  const overallSpan = spanDays(txns) || 90;
  const expected7 = (sum(crossInbound) * 7) / overallSpan;
  const ratio = expected7 > 0 ? peakUsd / expected7 : Infinity;
  const highRiskShare = window.filter((t) => HIGH_RISK_JURISDICTIONS.has(t.counterpartyCountry)).length / window.length;

  // Spike + many distinct new counterparties, and either dominated by high-risk
  // jurisdictions or wildly above the entity's own norm. Keeps clean entities
  // (steady supplier flows) from tripping the rule.
  if (!(distinct >= 6 && ratio >= 3 && (highRiskShare >= 0.4 || ratio >= 5))) return null;

  const days = spanDays(window);
  const severity: AmlSeverity = highRiskShare >= 0.6 && ratio >= 5 ? "critical" : "high";
  return {
    flagType: "money_mule",
    severity,
    evidence: window,
    metrics: {
      transactions: window.length,
      distinctCounterparties: distinct,
      windowDays: days,
      peakWindowUsd: peakUsd,
      expectedWindowUsd: Math.round(expected7),
      ratioVsNormal: Number(ratio.toFixed(1)),
      highRiskShare: Number(highRiskShare.toFixed(2)),
    },
    rationale:
      `${window.length} high-value inbound cross-border transfers (total ${usd(peakUsd)}) from ${distinct} distinct ` +
      `counterparties arrived within ${days} days — roughly ${ratio.toFixed(1)}× the entity's normal cross-border inflow, ` +
      `${Math.round(highRiskShare * 100)}% from higher-risk jurisdictions. The pass-through pattern is consistent with money-mule / funnel-account activity inconsistent with historical behaviour.`,
  };
}

// --- Dormancy break -----------------------------------------------------------
function detectDormancy(txns: Transaction[]): Candidate | null {
  if (txns.length < 3) return null;
  const latest = ms(txns[txns.length - 1]);
  const cut = latest - 14 * DAY;
  const recent = txns.filter((t) => ms(t) >= cut);
  const prior = txns.filter((t) => ms(t) < cut);
  if (!recent.length || !prior.length) return null;

  const recentVol = sum(recent);
  const priorVol = sum(prior);
  const observedDays = Math.round((latest - ms(txns[0])) / DAY);
  const dormantDays = Math.max(0, observedDays - 14);

  // Near-zero over a long observed history, then a large recent burst.
  if (!(priorVol < 200_000 && recentVol > 1_000_000 && observedDays >= 25)) return null;

  const severity: AmlSeverity = recentVol > 3_000_000 ? "high" : "medium";
  return {
    flagType: "dormancy_break",
    severity,
    evidence: recent,
    metrics: { dormantDays, priorVolumeUsd: priorVol, recentVolumeUsd: recentVol, recentTransactions: recent.length },
    rationale:
      `After roughly ${dormantDays} days of near-dormancy (only ${usd(priorVol)} of total activity), the account ` +
      `processed ${recent.length} transfers totalling ${usd(recentVol)} in the last 14 days. A sudden activation of a ` +
      `long-dormant account is a recognised suspicious-activity pattern requiring validation of business legitimacy.`,
  };
}

const DETECTORS = [detectStructuring, detectMoneyMule, detectDormancy];

/**
 * Runs every detector over the entity's stored transactions and upserts a
 * finding per fired rule. Findings are always created/kept 'proposed' — a
 * detection run never confirms or escalates (human-in-the-loop guardrail).
 */
export async function runAmlDetection(entityName: string): Promise<AmlFinding[]> {
  const txns = await getTransactions(entityName);
  const findings: AmlFinding[] = [];
  for (const detector of DETECTORS) {
    const c = detector(txns);
    if (!c) continue;
    findings.push(
      await upsertFinding({
        entityName,
        flagType: c.flagType,
        severity: c.severity,
        confidence: SEVERITY_CONFIDENCE[c.severity],
        evidenceTxIds: c.evidence.map((t) => t.id),
        metrics: c.metrics,
        rationale: c.rationale,
        recommendedAction: AML_FLAG_ACTION[c.flagType],
        detectedBy: DETECTOR,
      })
    );
  }
  return findings;
}

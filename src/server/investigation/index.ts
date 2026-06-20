import { AML_FLAG_LABEL, getFindings, getTransactions, type AmlFinding, type Transaction } from "../aml";
import { addressesFor, getOnchainTx, type OnchainTx } from "../onchain";
import type {
  FlowCluster,
  InvestigationFinding,
  InvestigationView,
  InvestigationWindow,
  TimelineEvent,
} from "./types";

/**
 * Read-only investigation join. Assembles a single, analyst-friendly view of a
 * concerning client by combining the Layer 2 internal transaction feed/findings
 * with the Layer 1 public on-chain feed — merged here for display only, never
 * written back across layers. The output is shaped for progressive disclosure
 * (see types.ts) so the analyst sees the pattern before the raw ledger.
 */

const DAY = 86_400_000;
const TIMELINE_CAP = 60;
const FLOW_CAP = 8;
const WINDOW_PAD_DAYS = 2;

/** The bank's higher-risk jurisdiction list (mirrors aml/detect.ts domain knowledge). */
const HIGH_RISK_JURISDICTIONS = new Set(["RU", "KY", "SC", "AE", "PA", "CY", "VG", "BVI"]);

const ms = (ts: string) => new Date(ts).getTime();

function deriveWindow(findings: AmlFinding[], evidenceTx: Transaction[]): InvestigationWindow | null {
  if (!findings.length || !evidenceTx.length) return null;
  const times = evidenceTx.map((t) => ms(t.ts)).sort((a, b) => a - b);
  const from = times[0] - WINDOW_PAD_DAYS * DAY;
  const to = times[times.length - 1] + WINDOW_PAD_DAYS * DAY;
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    days: Math.max(1, Math.round((to - from) / DAY)),
  };
}

function inWindow(ts: string, window: InvestigationWindow | null): boolean {
  if (!window) return true;
  const t = ms(ts);
  return t >= ms(window.from) && t <= ms(window.to);
}

function internalEvent(t: Transaction, evidenceIds: Set<string>): TimelineEvent {
  return {
    plane: "internal",
    id: t.id,
    ts: t.ts,
    direction: t.direction,
    amountUsd: t.amountUsd,
    counterparty: t.counterparty,
    detail: `${t.counterpartyCountry}${t.crossBorder ? " · cross-border" : ""} · ${t.channel}`,
    evidence: evidenceIds.has(t.id),
    highRisk: HIGH_RISK_JURISDICTIONS.has(t.counterpartyCountry),
  };
}

function onchainEvent(t: OnchainTx): TimelineEvent {
  return {
    plane: "onchain",
    id: t.id,
    ts: t.ts,
    direction: t.direction,
    amountUsd: t.amountUsd,
    counterparty: t.counterpartyLabel ?? t.counterpartyAddress.slice(0, 10) + "…",
    detail: `${t.chain} · ${t.asset}${t.riskFlag ? ` · ${t.riskFlag}` : ""}`,
    evidence: false,
    highRisk: t.riskFlag != null,
  };
}

/** Aggregate events into counterparty clusters sized by volume — the anomaly's shape. */
function buildFlows(events: TimelineEvent[]): FlowCluster[] {
  const byKey = new Map<string, FlowCluster>();
  for (const e of events) {
    const key = `${e.plane}:${e.detail.split(" · ")[0]}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.totalUsd += e.amountUsd;
      existing.count += 1;
      existing.highRisk = existing.highRisk || e.highRisk;
      if (existing.direction !== e.direction) existing.direction = "mixed";
    } else {
      byKey.set(key, {
        plane: e.plane,
        label: e.detail.split(" · ")[0],
        direction: e.direction,
        totalUsd: e.amountUsd,
        count: 1,
        highRisk: e.highRisk,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => b.totalUsd - a.totalUsd).slice(0, FLOW_CAP);
}

function toFinding(f: AmlFinding): InvestigationFinding {
  return {
    id: f.id,
    flagType: f.flagType,
    label: AML_FLAG_LABEL[f.flagType],
    severity: f.severity,
    confidence: f.confidence,
    rationale: f.rationale,
    recommendedAction: f.recommendedAction,
    narrative: f.narrative,
    status: f.status,
    evidenceCount: f.evidenceTxIds.length,
    metrics: f.metrics,
  };
}

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export async function buildInvestigation(entityName: string): Promise<InvestigationView> {
  const [findings, internalTx, onchainTx] = await Promise.all([
    getFindings({ entityName }),
    getTransactions(entityName),
    getOnchainTx(entityName),
  ]);

  const evidenceIds = new Set(findings.flatMap((f) => f.evidenceTxIds));
  const evidenceTx = internalTx.filter((t) => evidenceIds.has(t.id));
  const window = deriveWindow(findings, evidenceTx);

  const windowInternal = internalTx.filter((t) => inWindow(t.ts, window));
  const windowOnchain = onchainTx.filter((t) => inWindow(t.ts, window));

  const internalEvents = windowInternal.map((t) => internalEvent(t, evidenceIds));
  const onchainEvents = windowOnchain.map(onchainEvent);
  const merged = [...internalEvents, ...onchainEvents].sort((a, b) => ms(b.ts) - ms(a.ts));

  // Evidence first, then highest-value, so the cap never drops a flagged row.
  const timeline = merged
    .slice()
    .sort((a, b) => {
      if (a.evidence !== b.evidence) return a.evidence ? -1 : 1;
      if (a.highRisk !== b.highRisk) return a.highRisk ? -1 : 1;
      return b.amountUsd - a.amountUsd;
    })
    .slice(0, TIMELINE_CAP)
    .sort((a, b) => ms(b.ts) - ms(a.ts));

  const evidence = internalEvents.filter((e) => e.evidence).sort((a, b) => ms(b.ts) - ms(a.ts));

  const topSeverity =
    findings.length > 0
      ? findings.slice().sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0))[0].severity
      : null;

  return {
    entityName,
    hasActivity: internalTx.length > 0 || onchainTx.length > 0,
    severity: topSeverity,
    window,
    findings: findings.map(toFinding),
    flows: buildFlows([...internalEvents, ...onchainEvents]),
    evidence,
    timeline,
    ledger: {
      internalCount: internalTx.length,
      onchainCount: onchainTx.length,
      internalTotalUsd: Math.round(internalTx.reduce((a, t) => a + t.amountUsd, 0)),
      onchainTotalUsd: Math.round(onchainTx.reduce((a, t) => a + t.amountUsd, 0)),
      windowInternalCount: windowInternal.length,
      windowOnchainCount: windowOnchain.length,
    },
    addresses: addressesFor(entityName),
    narrative: null,
  };
}

export { type InvestigationView, type Plane } from "./types";
export { narrateInvestigation } from "./narrate";

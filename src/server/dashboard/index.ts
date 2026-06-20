import { getBaselines, getClientProfiles, type ClientProfile, type KycBaseline } from "../baseline";
import { getAlerts, getDriftFindings } from "../classify/store";
import type { Alert, DriftFinding } from "../classify/types";
import { RISK_TAXONOMY } from "../filter/taxonomy";
import { getStoredSignals } from "../signals";
import type { Signal, SignalSource } from "../signals/types";
import type { ClientRecord } from "./types";

/**
 * Dashboard join — the explicit, read-only place Layer 1 (public signals,
 * pipeline alerts, drift findings) and Layer 2 (KYC baseline + synthetic client
 * profile) are combined for presentation. It performs no LLM calls and writes
 * nothing back; it reads each store independently and assembles the frontend's
 * `ClientRecord` shape. Keeping the join here (rather than letting a fetcher or
 * the UI reach across layers) preserves the data-separation guardrail: the two
 * planes meet only in named, auditable join steps (this one for display, Stage 3
 * for analysis).
 */

const FLAG_LABEL = new Map(RISK_TAXONOMY.map((c) => [c.id, c.label]));

const SOURCE_LABEL: Record<SignalSource, string> = {
  google_news_rss: "Google News",
  gdelt: "GDELT",
  open_sanctions: "OpenSanctions",
  newsapi: "NewsAPI",
  mediastack: "Mediastack",
  crunchbase: "Crunchbase",
};

const RISK_TITLE: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };
const SEV_TITLE: Record<string, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
const BASE_POINTS: Record<string, number> = { Low: 20, Medium: 30, High: 40 };
const SEV_POINTS: Record<string, number> = { Critical: 28, High: 20, Medium: 12, Low: 5 };

/** pg returns TIMESTAMPTZ columns as Date objects; normalize to an ISO string. */
function toIso(v: string | Date | null | undefined): string {
  if (!v) return "";
  return v instanceof Date ? v.toISOString() : String(v);
}

function monthYear(value: string | Date): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

function relativeTime(value: string | Date): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "recently";
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const STATUS_MAP: Record<Alert["status"], string> = {
  proposed: "New",
  confirmed: "In Review",
  escalated: "Escalated",
  dismissed: "Cleared",
};

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

function dateOf(s: Signal): string {
  return toIso(s.publishedAt ?? s.fetchedAt).slice(0, 10);
}

/** Build a 3-dimension risk breakdown from the alert/drift context. */
function buildBreakdown(
  flagged: boolean,
  severity: string,
  flagType: string | null,
  relationship: string,
  rationale: string
): ClientRecord["riskBreakdown"] {
  const high = severity === "Critical" || severity === "High";
  const compliance = flagged ? (high ? "High" : "Medium") : "Low";
  const reputational =
    flagType === "adverse_media" || flagType === "sanctions_watchlist" || flagType === "regulatory_legal_action"
      ? high
        ? "High"
        : "Medium"
      : flagged
        ? "Medium"
        : "Low";
  const lending = relationship.toLowerCase() === "lending";
  const credit = lending ? (flagged ? "Medium" : "Low") : "Not Applicable";
  return [
    {
      type: "Compliance Risk",
      status: compliance,
      reason: flagged
        ? firstSentence(rationale) || "Public signals diverge from the onboarding KYC profile."
        : "No active divergence from the onboarding KYC profile.",
    },
    {
      type: "Reputational Risk",
      status: reputational,
      reason: flagged
        ? "Public coverage may attract scrutiny to the relationship."
        : "No material adverse coverage detected.",
    },
    {
      type: "Credit Risk",
      status: credit,
      reason: lending
        ? "Active lending exposure on this relationship."
        : "No active lending exposure on this relationship.",
    },
  ];
}

function toRecord(
  id: number,
  baseline: KycBaseline,
  profile: ClientProfile | null,
  signals: Signal[],
  alert: Alert | null,
  drift: DriftFinding | null
): ClientRecord {
  const signalsById = new Map(signals.map((s) => [s.id, s]));
  const originalRisk = RISK_TITLE[baseline.riskRating] ?? "Medium";
  const flagged = Boolean(alert);

  // Citations: the flagged alert's cited signals, or (for un-flagged clients)
  // the most recent stored signals so the profile page still has provenance.
  const citationSignals = alert
    ? alert.citations.map((cid) => signalsById.get(cid)).filter((s): s is Signal => Boolean(s))
    : signals.slice(0, 3);
  const citations = citationSignals.map((s) => ({
    source: SOURCE_LABEL[s.source] ?? s.source,
    date: dateOf(s),
    headline: s.title,
  }));
  const sources = Math.max(citations.length, alert ? 1 : signals.length ? Math.min(signals.length, 3) : 0);

  const severity = drift
    ? SEV_TITLE[drift.severity] ?? "Medium"
    : flagged
      ? alert!.confidence >= 0.85
        ? "High"
        : alert!.confidence >= 0.6
          ? "Medium"
          : "Low"
      : "Low";

  // Risk score, decomposed the same way the profile UI re-derives it.
  const base = BASE_POINTS[originalRisk] ?? 30;
  const sevPts = SEV_POINTS[severity] ?? 5;
  const corrob = Math.min(sources * 3, 15);
  const driftBonus = flagged ? (drift?.driftDetected ? 14 : 6) : 0;
  const riskScore = Math.min(100, base + (flagged ? sevPts : 0) + corrob + driftBonus);
  const riskDelta = flagged ? Math.max(1, Math.round((sevPts + driftBonus) / 2)) : 0;

  const currentRisk = !flagged
    ? originalRisk
    : severity === "Critical" || severity === "High"
      ? "High"
      : severity === "Medium"
        ? originalRisk === "Low"
          ? "Medium"
          : "High"
        : originalRisk;

  const flagLabel = alert ? FLAG_LABEL.get(alert.flagType) ?? alert.flagType : null;

  return {
    id,
    client: baseline.companyName,
    sector: profile?.displaySector ?? baseline.expectedSectors.join(" / "),
    jurisdiction: profile?.jurisdiction ?? baseline.expectedCountries.join(", "),
    relationship: profile?.relationship ?? "Trading",
    flagged,
    exposureUsd: profile?.exposureUsd ?? 0,
    severity,
    originalRisk,
    currentRisk,
    riskScore,
    riskDelta,
    signal: flagLabel ?? "No active flag",
    trigger: alert
      ? firstSentence(alert.rationale)
      : "No material change against the onboarding baseline.",
    sources,
    detected: alert ? relativeTime(alert.createdAt) : "—",
    status: alert ? STATUS_MAP[alert.status] : "Monitored",
    kyc: {
      onboarded: monthYear(baseline.onboardedAt),
      expectedModel: baseline.expectedBusinessModel,
      expectedActivity: baseline.expectedTxVolumeRange,
      owners: baseline.ownershipStructure.join("; "),
    },
    baseline: `Onboarded ${monthYear(baseline.onboardedAt)} as ${baseline.expectedBusinessModel} Expected activity: ${baseline.expectedTxVolumeRange}. Risk rating: ${originalRisk}.`,
    observed: drift?.narrative ?? alert?.rationale ?? "No material change detected against the onboarding baseline.",
    reasoning: alert?.rationale ?? "No public signals currently diverge from the onboarding profile.",
    confidence: alert?.confidence ?? 0,
    tier: drift ? "Deep" : alert ? "LLM" : "Rules",
    action: drift?.recommendedAction ?? alert?.recommendedAction ?? "Continue routine monitoring.",
    summary:
      drift?.narrative ??
      (alert
        ? `${alert.rationale} Recommended action: ${alert.recommendedAction}`
        : `${baseline.companyName} remains consistent with its onboarding profile; no public signal has crossed the alerting threshold.`),
    riskBreakdown: buildBreakdown(flagged, severity, alert?.flagType ?? null, profile?.relationship ?? "Trading", alert?.rationale ?? ""),
    citations,
    watchlist: profile?.watchlist ?? false,
    watchlistMeta: profile?.watchlistMeta ?? undefined,
  };
}

/**
 * Assembles the full client book as `ClientRecord[]`. One record per KYC
 * baseline (Layer 2); each enriched with its synthetic profile, ingested
 * signals, the highest-confidence pipeline alert, and that alert's Stage 3 drift
 * finding when one exists.
 */
export async function buildClientRecords(): Promise<ClientRecord[]> {
  const [baselines, profiles] = await Promise.all([getBaselines(), getClientProfiles()]);
  const profileByName = new Map(profiles.map((p) => [p.companyName.toLowerCase(), p]));

  // Stable ids: 1-based, ordered by company name (getBaselines already sorts).
  const records = await Promise.all(
    baselines.map(async (baseline, i) => {
      const [signals, alerts] = await Promise.all([
        getStoredSignals({ entityHint: baseline.companyName }),
        getAlerts({ entityHint: baseline.companyName }),
      ]);
      // Primary alert: highest confidence, then most recent.
      const alert =
        alerts.slice().sort((a, b) =>
          b.confidence !== a.confidence
            ? b.confidence - a.confidence
            : toIso(b.createdAt).localeCompare(toIso(a.createdAt))
        )[0] ?? null;
      const drift = alert ? (await getDriftFindings(alert.id))[0] ?? null : null;
      return toRecord(i + 1, baseline, profileByName.get(baseline.companyName.toLowerCase()) ?? null, signals, alert, drift);
    })
  );

  return records;
}

import { AML_FLAG_LABEL, getFindings, type AmlFinding } from "../aml";
import { getExposureEdges } from "../exposure";
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
const SEV_RANK: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };

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

/** Build the risk breakdown from the alert/drift and AML context. */
function buildBreakdown(
  flagged: boolean,
  severity: string,
  flagType: string | null,
  relationship: string,
  rationale: string,
  aml: AmlFinding | null
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
  const rows: ClientRecord["riskBreakdown"] = [
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
  // Behavioural / AML dimension — only present when transaction monitoring fired.
  if (aml) {
    const amlSev = SEV_TITLE[aml.severity] ?? "Medium";
    rows.push({
      type: "Behavioural / AML Risk",
      status: amlSev === "Critical" ? "High" : amlSev,
      reason: firstSentence(aml.rationale),
    });
  }
  return rows;
}

function toRecord(
  id: number,
  baseline: KycBaseline,
  profile: ClientProfile | null,
  signals: Signal[],
  alert: Alert | null,
  drift: DriftFinding | null,
  aml: AmlFinding | null,
  exposureTags: ClientRecord["exposureTags"]
): ClientRecord {
  const signalsById = new Map(signals.map((s) => [s.id, s]));
  const originalRisk = RISK_TITLE[baseline.riskRating] ?? "Medium";

  // Two possible risk drivers: a Layer 1 news alert (Stage 2/3) and a Layer 2
  // AML finding. Whichever is more severe drives the headline fields; both feed
  // the risk breakdown. This is where the news/KYC-drift pipeline and the
  // transaction-monitoring pipeline meet on the dashboard.
  const newsSeverity = alert
    ? drift
      ? SEV_TITLE[drift.severity] ?? "Medium"
      : alert.confidence >= 0.85
        ? "High"
        : alert.confidence >= 0.6
          ? "Medium"
          : "Low"
    : null;
  const amlSeverity = aml ? SEV_TITLE[aml.severity] ?? "Medium" : null;

  const flagged = Boolean(alert || aml);
  const driver: "news" | "aml" | null =
    alert && aml
      ? (SEV_RANK[amlSeverity!] ?? 0) > (SEV_RANK[newsSeverity!] ?? 0)
        ? "aml"
        : "news"
      : aml
        ? "aml"
        : alert
          ? "news"
          : null;

  const severity = driver === "aml" ? amlSeverity! : driver === "news" ? newsSeverity! : "Low";

  // Citations: news-alert signals + an AML evidence summary entry, ordered so
  // the dominant driver's provenance comes first.
  const newsCitations = alert
    ? alert.citations
        .map((cid) => signalsById.get(cid))
        .filter((s): s is Signal => Boolean(s))
        .map((s) => ({ source: SOURCE_LABEL[s.source] ?? s.source, date: dateOf(s), headline: s.title, url: s.url }))
    : [];
  const amlCitations = aml
    ? [
        {
          source: "AML Monitoring",
          date: toIso(aml.createdAt).slice(0, 10),
          headline: `${aml.evidenceTxIds.length} flagged transactions — ${AML_FLAG_LABEL[aml.flagType]}`,
        },
      ]
    : [];
  const citations =
    driver === "aml" ? [...amlCitations, ...newsCitations] : [...newsCitations, ...amlCitations];
  const sources = Math.max(citations.length, flagged ? 1 : Math.min(signals.length, 3));

  // Risk score, decomposed the same way the profile UI re-derives it.
  const base = BASE_POINTS[originalRisk] ?? 30;
  const sevPts = SEV_POINTS[severity] ?? 5;
  const corrob = Math.min(sources * 3, 15);
  const bonus = !flagged ? 0 : driver === "aml" ? ((SEV_RANK[severity] ?? 0) >= 3 ? 14 : 8) : drift?.driftDetected ? 14 : 6;
  const riskScore = Math.min(100, base + (flagged ? sevPts : 0) + corrob + bonus);
  const riskDelta = flagged ? Math.max(1, Math.round((sevPts + bonus) / 2)) : 0;

  const currentRisk = !flagged
    ? originalRisk
    : severity === "Critical" || severity === "High"
      ? "High"
      : severity === "Medium"
        ? originalRisk === "Low"
          ? "Medium"
          : "High"
        : originalRisk;

  // Headline fields from the dominant driver.
  const amlTier = aml ? (aml.detectedBy.startsWith("rules") ? "Rules" : "LLM") : "Rules";
  const driven =
    driver === "aml"
      ? {
          signal: AML_FLAG_LABEL[aml!.flagType],
          trigger: firstSentence(aml!.rationale),
          observed: aml!.narrative ?? aml!.rationale,
          reasoning: aml!.rationale,
          summary: aml!.narrative ?? `${aml!.rationale} Recommended action: ${aml!.recommendedAction}`,
          action: aml!.recommendedAction,
          tier: amlTier,
          detected: relativeTime(aml!.createdAt),
          confidence: aml!.confidence,
          status: STATUS_MAP[aml!.status],
        }
      : driver === "news"
        ? {
            signal: FLAG_LABEL.get(alert!.flagType) ?? alert!.flagType,
            trigger: firstSentence(alert!.rationale),
            observed: drift?.narrative ?? alert!.rationale,
            reasoning: alert!.rationale,
            summary: drift?.narrative ?? `${alert!.rationale} Recommended action: ${alert!.recommendedAction}`,
            action: drift?.recommendedAction ?? alert!.recommendedAction,
            tier: drift ? "Deep" : "LLM",
            detected: relativeTime(alert!.createdAt),
            confidence: alert!.confidence,
            status: STATUS_MAP[alert!.status],
          }
        : {
            signal: "No active flag",
            trigger: "No material change against the onboarding baseline.",
            observed: "No material change detected against the onboarding baseline.",
            reasoning: "No public signals currently diverge from the onboarding profile.",
            summary: `${baseline.companyName} remains consistent with its onboarding profile; no signal has crossed the alerting threshold.`,
            action: "Continue routine monitoring.",
            tier: "Rules",
            detected: "—",
            confidence: 0,
            status: "Monitored",
          };

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
    signal: driven.signal,
    trigger: driven.trigger,
    sources,
    detected: driven.detected,
    status: driven.status,
    kyc: {
      onboarded: monthYear(baseline.onboardedAt),
      expectedModel: baseline.expectedBusinessModel,
      expectedActivity: baseline.expectedTxVolumeRange,
      owners: baseline.ownershipStructure.join("; "),
    },
    baseline: `Onboarded ${monthYear(baseline.onboardedAt)} as ${baseline.expectedBusinessModel} Expected activity: ${baseline.expectedTxVolumeRange}. Risk rating: ${originalRisk}.`,
    observed: driven.observed,
    reasoning: driven.reasoning,
    confidence: driven.confidence,
    tier: driven.tier,
    action: driven.action,
    summary: driven.summary,
    riskBreakdown: buildBreakdown(flagged, severity, alert?.flagType ?? null, profile?.relationship ?? "Trading", driven.reasoning, aml),
    citations,
    exposureTags,
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
  // Processed sequentially per entity to bound concurrent DB connections under
  // the Supabase pooler limit.
  const records: ClientRecord[] = [];
  for (let i = 0; i < baselines.length; i++) {
    const baseline = baselines[i];
    const [signals, alerts, amlFindings, edges] = await Promise.all([
      getStoredSignals({ entityHint: baseline.companyName }),
      getAlerts({ entityHint: baseline.companyName }),
      getFindings({ entityName: baseline.companyName }),
      getExposureEdges({ entityName: baseline.companyName }),
    ]);
    const exposureTags = edges.map((e) => ({
      tagType: e.tagType,
      tagValue: e.tagValue,
      source: e.source,
      confidence: e.confidence,
    }));
    // Primary alert: highest confidence, then most recent.
    const alert =
      alerts.slice().sort((a, b) =>
        b.confidence !== a.confidence
          ? b.confidence - a.confidence
          : toIso(b.createdAt).localeCompare(toIso(a.createdAt))
      )[0] ?? null;
    const drift = alert ? (await getDriftFindings(alert.id))[0] ?? null : null;
    // Findings come severity-ordered from the store; take the most severe.
    const aml = amlFindings[0] ?? null;
    records.push(
      toRecord(
        i + 1,
        baseline,
        profileByName.get(baseline.companyName.toLowerCase()) ?? null,
        signals,
        alert,
        drift,
        aml,
        exposureTags
      )
    );
  }

  return records;
}

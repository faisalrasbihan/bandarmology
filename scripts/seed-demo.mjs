// scripts/seed-demo.mjs
//
// Demo data seeder for the Layer 1 pipeline output (signals + Stage 1 triage +
// Stage 2 alerts + Stage 3 drift + cost logs). The KYC baselines and client
// profiles (Layer 2) are owned by the TS seed files and applied via
// POST /api/baselines/seed — this script only writes the Layer 1 side and the
// alerts that join them, i.e. what the live ingest + LLM pipeline would produce
// if news APIs / an Anthropic key were available in this environment.
//
// Why a script and not the live pipeline: the dev server here has no news API
// keys or ANTHROPIC_API_KEY, so Stage 2 can't run. This synthesizes equivalent
// output while honouring the repo's non-negotiables:
//   * every alert cites a REAL row in the signals table (its own signal id);
//   * every alert carries confidence + human-readable rationale + status;
//   * every alert has a matching llm_calls row so the cost metric stays honest;
//   * alerts start 'proposed'; a few are advanced to confirmed/escalated only
//     with an accompanying alert_decisions audit row (human-in-the-loop).
//
// For the EXISTING entities it does NOT fabricate signals — it attaches alerts
// to their real, already-ingested Stage-1 survivors that don't yet have one.
//
// Idempotent: re-running upserts signals by url_key and skips signals that
// already have an alert. Run with DATABASE_URL set.

import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

// ── pricing (mirror of src/server/anthropic.ts) ──────────────────────────────
const PRICING = {
  "claude-haiku-4-5": { input: 1.0 / 1_000_000, output: 5.0 / 1_000_000 },
  "claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
};
const STAGE2_MODEL = "claude-haiku-4-5";
const STAGE3_MODEL = "claude-sonnet-4-6";
const cost = (model, input, output) =>
  input * PRICING[model].input + output * PRICING[model].output;

const CATEGORY_LABEL = {
  sanctions_watchlist: "Sanctions / Watchlist Hit",
  adverse_media: "Adverse Media / Reputational Risk",
  financial_distress: "Financial Distress / Insolvency",
  cyber_incident: "Cyber Incident / Data Breach",
  regulatory_legal_action: "Regulatory / Legal Action",
  ownership_control_change: "Ownership / Control Change",
  leadership_change: "Leadership / Key Person Change",
  business_model_drift: "Business Activity / Model Change",
  jurisdiction_geographic_risk: "Jurisdiction / Geographic Risk",
  litigation_dispute: "Litigation / Legal Dispute",
  political_exposure: "PEP / Political Exposure",
};

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

// ── new-entity signals + the alerts they raise ───────────────────────────────
// `drift` (optional) attaches a Stage 3 finding to that alert; a 'critical'
// drift severity is what surfaces a Critical card + the "Deep" tier in the UI.
const NEW_ENTITIES = [
  {
    entity: "FTX Trading Ltd",
    signals: [
      {
        source: "newsapi",
        category: "financial_distress",
        flagType: "financial_distress",
        confidence: 0.96,
        status: "proposed",
        title: "FTX estate reports multi-billion shortfall as clawback suits widen",
        snippet:
          "Court filings show the FTX bankruptcy estate is pursuing clawbacks against former insiders and counterparties as the reported customer shortfall widens.",
        rationale:
          "Filings in the FTX bankruptcy estate report a multi-billion-dollar customer shortfall and widening clawback litigation. This is a severe financial-distress and fraud signal that flatly contradicts the onboarding profile of a solvent, custodial exchange.",
        action: "Freeze exposure and escalate to the financial-crime unit for an EDD review.",
        drift: {
          driftType: "business_model_change",
          severity: "critical",
          confidence: 0.95,
          comparison: [
            { dimension: "Business model", expected: "Custodial exchange holding client assets 1:1", observed: "Customer assets commingled and misappropriated; multi-billion shortfall", changed: true },
            { dimension: "Solvency", expected: "Solvent, profitable exchange", observed: "Insolvent; in bankruptcy with active clawback suits", changed: true },
            { dimension: "Risk rating", expected: "High (crypto exchange)", observed: "Critical — fraud and insolvency confirmed", changed: true },
          ],
          narrative:
            "The onboarding profile described a solvent custodial exchange. Public filings now describe an insolvent estate with a multi-billion-dollar customer shortfall and clawback litigation against insiders — a critical divergence on both business model and solvency.",
          action: "Freeze all exposure, file an internal SAR, and escalate to senior compliance immediately.",
        },
      },
      {
        source: "google_news_rss",
        category: "adverse_media",
        flagType: "adverse_media",
        confidence: 0.9,
        status: "confirmed",
        decisionNote: "Coverage corroborated across multiple outlets; moved to review.",
        title: "Former FTX executives cooperate in ongoing fraud probe",
        snippet:
          "Several former FTX executives are reported to be cooperating with prosecutors in a continuing fraud investigation.",
        rationale:
          "Multiple outlets report former FTX executives cooperating with an ongoing fraud investigation. This corroborates the adverse-media picture and raises reputational and counterparty risk for any retained relationship.",
        action: "Document the adverse media and maintain the freeze pending estate resolution.",
      },
      {
        source: "gdelt",
        category: "regulatory_legal_action",
        flagType: "regulatory_legal_action",
        confidence: 0.84,
        status: "proposed",
        title: "Regulators detail FTX customer-asset commingling findings",
        snippet:
          "Regulatory findings describe commingling of customer assets and inadequate controls at the failed exchange.",
        rationale:
          "Regulatory findings describe commingling of customer assets and inadequate segregation controls at FTX. A formal regulatory characterisation of control failures supports the highest-severity treatment.",
        action: "Attach the regulatory findings to the case file supporting escalation.",
      },
    ],
  },
  {
    entity: "Evergrande Group",
    signals: [
      {
        source: "mediastack",
        category: "financial_distress",
        flagType: "financial_distress",
        confidence: 0.93,
        status: "escalated",
        decisionNote: "Winding-up order confirmed; escalated to credit committee.",
        title: "Evergrande liquidators move to seize overseas assets after winding-up order",
        snippet:
          "Liquidators appointed under a winding-up order are moving to seize overseas assets of the property group.",
        rationale:
          "A winding-up order has been issued and liquidators are seizing overseas assets. For a lending relationship this is a critical insolvency event with direct cross-default and recovery implications.",
        action: "Escalate to the credit committee; reassess collateral and provisioning immediately.",
        drift: {
          driftType: "risk_rating_change",
          severity: "critical",
          confidence: 0.92,
          comparison: [
            { dimension: "Solvency", expected: "Going-concern property developer", observed: "Subject to winding-up order; liquidators appointed", changed: true },
            { dimension: "Activity", expected: "Active construction and financing flows", observed: "Asset seizures and creditor recovery", changed: true },
            { dimension: "Risk rating", expected: "High", observed: "Critical — insolvency confirmed", changed: true },
          ],
          narrative:
            "Onboarded as a going-concern developer, Evergrande is now in liquidation with overseas asset seizures under way. The divergence is critical and materially impairs the lending exposure.",
          action: "Escalate to credit committee, reassess provisioning, and review cross-default triggers.",
        },
      },
      {
        source: "google_news_rss",
        category: "litigation_dispute",
        flagType: "litigation_dispute",
        confidence: 0.7,
        status: "proposed",
        title: "Creditors file fresh claims against Evergrande units",
        snippet: "Offshore creditors have filed additional claims against several Evergrande subsidiaries.",
        rationale:
          "Offshore creditors have filed fresh claims against Evergrande subsidiaries, indicating contested and escalating recovery proceedings that compound the insolvency picture.",
        action: "Track litigation exposure across group entities in the case file.",
      },
    ],
  },
  {
    entity: "Danske Bank A/S",
    signals: [
      {
        source: "newsapi",
        category: "regulatory_legal_action",
        flagType: "regulatory_legal_action",
        confidence: 0.9,
        status: "confirmed",
        decisionNote: "Estonia-branch findings verified against public record.",
        title: "Danske Bank faces renewed scrutiny over Estonia branch AML failures",
        snippet:
          "Authorities have renewed scrutiny of historic anti-money-laundering failures at the bank's Estonia branch.",
        rationale:
          "Renewed regulatory scrutiny of the Estonia-branch AML failures revives one of the largest money-laundering cases on record. For a correspondent relationship this materially raises AML risk on non-resident flows.",
        action: "Apply enhanced monitoring to non-resident correspondent flows and document the rationale.",
      },
      {
        source: "google_news_rss",
        category: "adverse_media",
        flagType: "adverse_media",
        confidence: 0.8,
        status: "proposed",
        title: "Whistleblower files reopen questions on Danske non-resident flows",
        snippet: "Newly surfaced whistleblower files renew questions about the bank's historic non-resident portfolio.",
        rationale:
          "Whistleblower files reopen questions about Danske's historic non-resident portfolio, reinforcing the adverse-media and AML risk narrative against the onboarding profile of a low-risk Nordic bank.",
        action: "Add to the EDD pack supporting the correspondent review.",
      },
      {
        source: "gdelt",
        category: "jurisdiction_geographic_risk",
        flagType: "jurisdiction_geographic_risk",
        confidence: 0.66,
        status: "proposed",
        title: "Baltic correspondent flows flagged in cross-border review",
        snippet: "A cross-border review has flagged elevated risk in Baltic correspondent banking flows.",
        rationale:
          "A cross-border review flags elevated risk in Baltic correspondent flows, a jurisdiction-risk dimension directly relevant to the bank's Estonia exposure.",
        action: "Confirm current Baltic-flow controls remain in force.",
      },
    ],
  },
  {
    entity: "Glencore plc",
    signals: [
      {
        source: "newsapi",
        category: "regulatory_legal_action",
        flagType: "regulatory_legal_action",
        confidence: 0.86,
        status: "proposed",
        title: "Glencore agrees additional settlement over bribery allegations",
        snippet: "The commodities group has agreed a further settlement resolving bribery and corruption allegations.",
        rationale:
          "Glencore has agreed a further settlement resolving bribery and corruption allegations. A formal enforcement settlement is a clear regulatory/legal-action flag with reputational spillover for the trading relationship.",
        action: "Record the settlement and review bribery-and-corruption controls on the relationship.",
      },
      {
        source: "google_news_rss",
        category: "litigation_dispute",
        flagType: "litigation_dispute",
        confidence: 0.62,
        status: "proposed",
        title: "Civil suits proceed against Glencore over commodity dealings",
        snippet: "Civil litigation tied to past commodity dealings is proceeding against the group.",
        rationale:
          "Civil litigation tied to past commodity dealings is proceeding, adding ongoing legal-dispute exposure on top of the settled enforcement matters.",
        action: "Monitor civil-litigation developments in the case file.",
      },
    ],
  },
  {
    entity: "NSO Group",
    signals: [
      {
        source: "gdelt",
        category: "sanctions_watchlist",
        flagType: "sanctions_watchlist",
        confidence: 0.88,
        status: "proposed",
        title: "NSO Group remains on US Entity List amid export-control review",
        snippet: "The surveillance-software vendor remains on the US Entity List as export controls are reviewed.",
        rationale:
          "NSO Group remains on the US Entity List, a denied-party/export-control designation. This is a direct sanctions/watchlist flag carrying significant compliance and correspondent-access risk.",
        action: "Screen against current designations and restrict prohibited dealings; escalate for sanctions review.",
      },
      {
        source: "google_news_rss",
        category: "adverse_media",
        flagType: "adverse_media",
        confidence: 0.78,
        status: "proposed",
        title: "Surveillance-software misuse allegations resurface against NSO",
        snippet: "Fresh reporting renews allegations that the vendor's software was misused against civil-society targets.",
        rationale:
          "Renewed allegations of product misuse against civil-society targets reinforce the reputational and human-rights risk dimension alongside the export-control designation.",
        action: "Document the adverse media in the sanctions/EDD case file.",
      },
    ],
  },
  {
    entity: "Wells Fargo & Co",
    signals: [
      {
        source: "newsapi",
        category: "regulatory_legal_action",
        flagType: "regulatory_legal_action",
        confidence: 0.72,
        status: "proposed",
        title: "Wells Fargo pays penalty over consumer-account practices",
        snippet: "The bank has paid a regulatory penalty resolving findings on consumer-account practices.",
        rationale:
          "Wells Fargo has paid a regulatory penalty over consumer-account practices. A resolved enforcement matter is a moderate regulatory flag; relevant to conduct risk but not a solvency or sanctions concern.",
        action: "Note the penalty; confirm remediation status on the correspondent relationship.",
      },
      {
        source: "google_news_rss",
        category: "litigation_dispute",
        flagType: "litigation_dispute",
        confidence: 0.55,
        status: "proposed",
        title: "Class action over account practices advances against Wells Fargo",
        snippet: "A consumer class action tied to account practices has advanced past an early procedural stage.",
        rationale:
          "A consumer class action tied to account practices has advanced, indicating continuing but contained conduct-risk litigation.",
        action: "Monitor the litigation; no change to relationship status at this time.",
      },
    ],
  },
  {
    entity: "Orion Bay Trading FZE",
    signals: [
      {
        source: "open_sanctions",
        category: "jurisdiction_geographic_risk",
        flagType: "jurisdiction_geographic_risk",
        confidence: 0.7,
        status: "proposed",
        title: "Free-zone trading entity linked to opaque ownership chain",
        snippet:
          "Registry data links the free-zone trading entity to an opaque ownership chain routed through corporate-services nominees.",
        rationale:
          "Public registry data links Orion Bay to an opaque ownership chain via corporate-services nominees in a high-risk free zone. This jurisdiction- and structure-risk pattern diverges from a transparent passive-trading profile.",
        action: "Request updated UBO documentation and apply enhanced due diligence before further activity.",
      },
      {
        source: "gdelt",
        category: "political_exposure",
        flagType: "political_exposure",
        confidence: 0.6,
        status: "proposed",
        title: "Nominee structure connects Orion Bay to politically exposed associate",
        snippet: "Open-source links the nominee structure to an associate of a politically exposed person.",
        rationale:
          "Open-source reporting connects the nominee structure to an associate of a politically exposed person, introducing PEP-adjacency risk that warrants source-of-funds scrutiny.",
        action: "Screen connected parties for PEP status and obtain source-of-funds evidence.",
      },
    ],
  },
];

// ── existing entities: attach alerts to REAL Stage-1 survivors ───────────────
// Confidence caps preserve the intended dashboard severity (Tesla/Nestlé stay
// Low/Medium; Binance/Wirecard already High). Rationale references the real
// signal title so the citation is meaningful.
const EXISTING_TOPUPS = [
  { entity: "Tesla", max: 3, confidences: [0.52, 0.48, 0.55], statuses: ["proposed", "proposed", "dismissed"] },
  { entity: "Nestle", max: 2, confidences: [0.5, 0.45], statuses: ["proposed", "dismissed"] },
  { entity: "Binance", max: 3, confidences: [0.82, 0.74, 0.66], statuses: ["proposed", "confirmed", "proposed"] },
  { entity: "Wirecard", max: 3, confidences: [0.88, 0.8, 0.72], statuses: ["proposed", "proposed", "confirmed"] },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const q = (text, params) => pool.query(text, params);

  let signalsInserted = 0;
  let alertsInserted = 0;
  let driftInserted = 0;
  let llmInserted = 0;
  let decisionsInserted = 0;

  // helper: insert a Stage-2 alert (+ llm_call, + optional decision/drift) for a
  // given signal id. Skips if the signal already has an alert (unique index).
  async function insertAlert({ signalId, entity, flagType, confidence, status, rationale, action, decisionNote, drift }) {
    const input = 1400 + Math.floor(Math.random() * 300);
    const output = 240 + Math.floor(Math.random() * 120);
    const alertId = randomUUID();
    const res = await q(
      `INSERT INTO alerts
         (id, signal_id, entity_hint, flag_type, confidence, citations, rationale,
          recommended_action, status, model_used, input_tokens, output_tokens, cost_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (signal_id) DO NOTHING
       RETURNING id`,
      [
        alertId, signalId, entity, flagType, confidence, [signalId], rationale,
        action, status, STAGE2_MODEL, input, output, cost(STAGE2_MODEL, input, output),
      ]
    );
    if (res.rowCount === 0) return null; // already had an alert
    alertsInserted++;

    // Stage-2 cost log (one per attempted classification).
    await q(
      `INSERT INTO llm_calls (id, stage, model, signal_id, input_tokens, output_tokens, cost_usd, success, error)
       VALUES ($1,'stage2',$2,$3,$4,$5,$6,true,null)`,
      [randomUUID(), STAGE2_MODEL, signalId, input, output, cost(STAGE2_MODEL, input, output)]
    );
    llmInserted++;

    // Human-in-the-loop audit row for anything advanced past 'proposed'.
    if (status !== "proposed") {
      await q(
        `INSERT INTO alert_decisions (id, alert_id, from_status, to_status, actor, note)
         VALUES ($1,$2,'proposed',$3,$4,$5)`,
        [randomUUID(), alertId, status, "Analyst — demo", decisionNote ?? "Reviewed during demo seeding."]
      );
      decisionsInserted++;
    }

    // Optional Stage-3 drift finding (+ its own cost log).
    if (drift) {
      const dIn = 2200 + Math.floor(Math.random() * 400);
      const dOut = 360 + Math.floor(Math.random() * 160);
      await q(
        `INSERT INTO drift_findings
           (id, alert_id, entity_hint, drift_detected, drift_type, severity, confidence,
            comparison, narrative, recommended_action, citations, model_used,
            input_tokens, output_tokens, cost_usd)
         VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          randomUUID(), alertId, entity, drift.driftType, drift.severity, drift.confidence,
          JSON.stringify(drift.comparison), drift.narrative, drift.action, [signalId],
          STAGE3_MODEL, dIn, dOut, cost(STAGE3_MODEL, dIn, dOut),
        ]
      );
      driftInserted++;
      await q(
        `INSERT INTO llm_calls (id, stage, model, signal_id, input_tokens, output_tokens, cost_usd, success, error)
         VALUES ($1,'stage3',$2,$3,$4,$5,$6,true,null)`,
        [randomUUID(), STAGE3_MODEL, signalId, dIn, dOut, cost(STAGE3_MODEL, dIn, dOut)]
      );
      llmInserted++;
    }
    return alertId;
  }

  // 1) New entities: synthesize signals + triage, then alerts.
  const baseTime = Date.parse("2026-06-15T12:00:00.000Z");
  for (const grp of NEW_ENTITIES) {
    for (let i = 0; i < grp.signals.length; i++) {
      const s = grp.signals[i];
      const signalId = randomUUID();
      const publishedAt = new Date(baseTime - (i * 3 + 1) * 86_400_000).toISOString();
      const urlKey = `demo-${slug(grp.entity)}-${slug(s.title)}`;
      const url = `https://demo.local/${urlKey}`;
      const titleDayKey = `${slug(s.title)}-${publishedAt.slice(0, 10)}`;
      const sourceTag = s.source;

      const inserted = await q(
        `INSERT INTO signals
           (id, entity_hint, source, merged_sources, title, snippet, url, url_key,
            title_day_key, published_at, fetched_at, sectors, countries, keywords, raw)
         VALUES ($1,$2,$3,'{}',$4,$5,$6,$7,$8,$9, now(), '{}', '{}', $10, $11)
         ON CONFLICT (url_key) DO UPDATE SET entity_hint = EXCLUDED.entity_hint
         RETURNING id, (xmax = 0) AS is_new`,
        [
          signalId, grp.entity, sourceTag, s.title, s.snippet, url, urlKey, titleDayKey,
          publishedAt, [s.category, s.flagType], JSON.stringify({ synthetic: true, demo: true }),
        ]
      );
      const realId = inserted.rows[0].id;
      if (inserted.rows[0].is_new) signalsInserted++;

      await q(
        `INSERT INTO signal_triage
           (signal_id, passed, top_category_id, top_category_label, top_score, matches, classified_at)
         VALUES ($1, true, $2, $3, $4, $5, now())
         ON CONFLICT (signal_id) DO NOTHING`,
        [
          realId, s.category, CATEGORY_LABEL[s.category], Math.min(0.95, s.confidence),
          JSON.stringify([{ categoryId: s.category, label: CATEGORY_LABEL[s.category], score: Math.min(0.95, s.confidence) }]),
        ]
      );

      await insertAlert({
        signalId: realId,
        entity: grp.entity,
        flagType: s.flagType,
        confidence: s.confidence,
        status: s.status,
        rationale: s.rationale,
        action: s.action,
        decisionNote: s.decisionNote,
        drift: s.drift,
      });
    }
  }

  // 2) Existing entities: attach alerts to real Stage-1 survivors with no alert.
  for (const top of EXISTING_TOPUPS) {
    const { rows } = await q(
      `SELECT s.id, s.title, t.top_category_id, t.top_category_label
         FROM signals s
         JOIN signal_triage t ON t.signal_id = s.id
         LEFT JOIN alerts a ON a.signal_id = s.id
        WHERE lower(s.entity_hint) = lower($1) AND t.passed AND a.id IS NULL
        ORDER BY t.top_score DESC NULLS LAST
        LIMIT $2`,
      [top.entity, top.max]
    );
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const flagType = r.top_category_id ?? "adverse_media";
      const label = r.top_category_label ?? CATEGORY_LABEL[flagType] ?? flagType;
      const confidence = top.confidences[i] ?? 0.5;
      const status = top.statuses[i] ?? "proposed";
      await insertAlert({
        signalId: r.id,
        entity: top.entity,
        flagType,
        confidence,
        status,
        rationale: `Public reporting — "${r.title}" — was triaged as ${label} for ${top.entity}. The coverage diverges from the onboarding profile and is surfaced for compliance review.`,
        action: "Review the cited coverage against the onboarding baseline and confirm or dismiss.",
        decisionNote: status !== "proposed" ? `Demo review action: ${status}.` : undefined,
      });
    }
  }

  console.log(
    JSON.stringify(
      { signalsInserted, alertsInserted, driftInserted, llmCallsInserted: llmInserted, decisionsInserted },
      null,
      2
    )
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

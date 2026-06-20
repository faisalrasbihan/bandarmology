/**
 * Default risk-flag taxonomy for Stage 1 triage. Not sourced from a specific
 * challenge spec (none was provided) — a reasonable KYC/AML risk-category set
 * covering the flag types the rest of ARCHITECTURE.md references (sanctions,
 * adverse media, business model drift, etc). Edit freely; Stage 1 has no
 * other dependency on the exact category list.
 */
export interface RiskCategory {
  id: string;
  label: string;
  description: string;
  keywords: string[];
}

export const RISK_TAXONOMY: RiskCategory[] = [
  {
    id: "sanctions_watchlist",
    label: "Sanctions / Watchlist Hit",
    description: "Entity or related party appears on a sanctions, embargo, or denied-party list.",
    keywords: [
      "sanction", "sanctions", "sanctioned", "ofac", "sdn list", "embargo",
      "asset freeze", "denied party", "watchlist", "blacklist", "export control",
    ],
  },
  {
    id: "adverse_media",
    label: "Adverse Media / Reputational Risk",
    description: "Negative press coverage suggesting fraud, scandal, or misconduct.",
    keywords: [
      "fraud", "scandal", "investigation", "indicted", "charged", "allegations",
      "probe", "whistleblower", "misconduct", "corruption",
    ],
  },
  {
    id: "financial_distress",
    label: "Financial Distress / Insolvency",
    description: "Signs the entity is in financial trouble or heading toward insolvency.",
    keywords: [
      "bankruptcy", "insolvency", "default", "debt restructuring", "liquidation",
      "going concern", "creditor", "chapter 11", "distressed", "write-down",
    ],
  },
  {
    id: "cyber_incident",
    label: "Cyber Incident / Data Breach",
    description: "Cyberattack, breach, or major security incident affecting the entity.",
    keywords: [
      "cyberattack", "cyber attack", "data breach", "ransomware", "hacked", "hack",
      "breach", "leaked data", "ddos", "phishing campaign",
    ],
  },
  {
    id: "regulatory_legal_action",
    label: "Regulatory / Legal Action",
    description: "Formal regulatory enforcement or penalty against the entity.",
    keywords: [
      "regulator", "fine", "penalty", "enforcement action", "consent order",
      "license revoked", "cease and desist", "settlement", "sec charges", "compliance violation",
    ],
  },
  {
    id: "ownership_control_change",
    label: "Ownership / Control Change",
    description: "Change in who owns or controls the entity.",
    keywords: [
      "acquisition", "acquired", "merger", "change of control", "majority stake",
      "takeover", "shareholder", "ownership transfer", "buyout", "divestiture",
    ],
  },
  {
    id: "leadership_change",
    label: "Leadership / Key Person Change",
    description: "Departure or appointment of a key executive or board member.",
    keywords: [
      "ceo resigns", "steps down", "appointed ceo", "executive departure",
      "board resignation", "new chairman", "founder ousted", "leadership shakeup",
    ],
  },
  {
    id: "business_model_drift",
    label: "Business Activity / Model Change",
    description: "The entity's actual business activity appears to differ from what was expected at onboarding.",
    keywords: [
      "pivot", "new business line", "expands into", "rebrand", "restructuring",
      "diversifies", "exits market", "enters market", "business model change",
    ],
  },
  {
    id: "jurisdiction_geographic_risk",
    label: "Jurisdiction / Geographic Risk",
    description: "Exposure to high-risk or opaque jurisdictions.",
    keywords: [
      "high-risk jurisdiction", "offshore", "tax haven", "shell company",
      "relocates headquarters", "cross-border", "fatf grey list", "secrecy jurisdiction",
    ],
  },
  {
    id: "litigation_dispute",
    label: "Litigation / Legal Dispute",
    description: "Formal litigation or legal disputes involving the entity.",
    keywords: [
      "lawsuit", "sued", "litigation", "court ruling", "settlement reached",
      "class action", "arbitration", "legal dispute",
    ],
  },
  {
    id: "political_exposure",
    label: "PEP / Political Exposure",
    description: "Links to politically exposed persons or government office.",
    keywords: [
      "politically exposed person", "pep", "government official", "minister",
      "elected official", "public office", "political appointee",
    ],
  },
];

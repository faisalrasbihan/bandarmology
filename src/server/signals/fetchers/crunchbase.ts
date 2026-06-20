import { toSignal } from "../helpers";
import type { FetchQuery, Signal } from "../types";

const API_URL = "https://api.crunchbase.com/api/v4/searches/organizations";

interface CrunchbaseEntity {
  properties?: {
    identifier?: { value?: string; permalink?: string };
    short_description?: string;
    funding_total?: { value_usd?: number };
    last_funding_type?: string;
    rank_org?: number;
  };
}

/**
 * Funding / corporate-registry intelligence from Crunchbase. Unlike the news
 * fetchers, funding rounds, investor changes and re-domiciles are exactly the
 * ownership/business-model-drift signals Stage 1 is tuned for, so this is a
 * high-value Layer 1 source.
 *
 * Crunchbase's REST API requires a paid key (`CRUNCHBASE_API_KEY`). When a key
 * is present we hit the v4 organization search; when it isn't, we fall back to a
 * deterministic *synthetic* funding feed so the demo still exercises this source
 * end-to-end. Synthetic items are normalized into the same `Signal` shape as
 * every other source, flagged with `raw.synthetic = true` and given stable URLs
 * so the dedupe store keeps them idempotent across runs — they are never
 * silently passed off as real Crunchbase data.
 */
export async function fetchCrunchbase(query: FetchQuery): Promise<Signal[]> {
  const apiKey = process.env.CRUNCHBASE_API_KEY;
  if (!apiKey) {
    return syntheticFunding(query);
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-cb-user-key": apiKey },
    body: JSON.stringify({
      field_ids: [
        "identifier",
        "short_description",
        "funding_total",
        "last_funding_type",
        "rank_org",
      ],
      query: [
        {
          type: "predicate",
          field_id: "identifier",
          operator_id: "contains",
          values: [query.companyName],
        },
      ],
      limit: Math.min(query.maxResults ?? 10, 25),
    }),
  });

  if (!res.ok) {
    throw new Error(`Crunchbase request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { entities?: CrunchbaseEntity[] };
  const fetchedAt = new Date().toISOString();

  return (data.entities ?? [])
    .map((e) => e.properties)
    .filter((p): p is NonNullable<CrunchbaseEntity["properties"]> => Boolean(p?.identifier?.value))
    .map((p): Signal => {
      const name = p.identifier!.value!;
      const permalink = p.identifier!.permalink ?? name.toLowerCase().replace(/\s+/g, "-");
      const total = p.funding_total?.value_usd;
      const round = p.last_funding_type ? p.last_funding_type.replace(/_/g, " ") : "funding";
      const totalStr = total ? ` — total funding $${(total / 1e6).toFixed(0)}M` : "";
      return toSignal(query, "crunchbase", {
        title: `${name}: ${round} round on record${totalStr}`,
        snippet: p.short_description,
        url: `https://www.crunchbase.com/organization/${permalink}`,
        publishedAt: null,
        fetchedAt,
        tags: { keywords: ["funding", round, "investment"] },
        raw: p as unknown as Record<string, unknown>,
      });
    });
}

// ---- Synthetic fallback ------------------------------------------------------

/** Tiny deterministic hash so synthetic figures are stable per company name. */
function seedFrom(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const SYNTHETIC_INVESTORS = [
  "Helios Growth Partners",
  "Meridian Capital",
  "Northgate Ventures",
  "Cayman Bridge Holdings",
  "Atlas Frontier Fund",
];

const SYNTHETIC_JURISDICTIONS = ["Cayman Islands", "Malta", "BVI", "Luxembourg", "Singapore"];

/**
 * Deterministic synthetic funding/registry signals used when no Crunchbase key
 * is configured. Three event types per entity (funding round, new investor /
 * ownership change, registry re-domicile) so the demo has fundable Layer 1
 * material that legitimately matches the ownership/business-model-drift
 * taxonomy. Stable URLs keep these idempotent under the dedupe store.
 */
function syntheticFunding(query: FetchQuery): Signal[] {
  const name = query.companyName;
  const s = seedFrom(name);
  const fetchedAt = new Date().toISOString();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const roundUsd = 10 + (s % 90); // $10M–$99M
  const investor = SYNTHETIC_INVESTORS[s % SYNTHETIC_INVESTORS.length];
  const jurisdiction = SYNTHETIC_JURISDICTIONS[(s >> 3) % SYNTHETIC_JURISDICTIONS.length];

  // Spread the three events across the past ~6 weeks, deterministically.
  const day = (offset: number) =>
    new Date(Date.now() - offset * 86_400_000).toISOString();

  const base = {
    fetchedAt,
    tags: { keywords: [] as string[] },
    raw: { synthetic: true, source: "crunchbase-synthetic" } as Record<string, unknown>,
  };

  return [
    toSignal(query, "crunchbase", {
      ...base,
      title: `${name} closes $${roundUsd}M round led by ${investor}`,
      snippet: `${name} raised $${roundUsd}M in new financing led by ${investor}, expanding its capital base.`,
      url: `https://www.crunchbase.com/funding_round/${slug}-round-${roundUsd}`,
      publishedAt: day(8 + (s % 5)),
      tags: { keywords: ["funding", "investment", "capital raise"] },
    }),
    toSignal(query, "crunchbase", {
      ...base,
      title: `${investor} acquires significant stake in ${name}`,
      snippet: `${investor} disclosed a significant ownership position in ${name}, adding a new beneficial owner to the cap table.`,
      url: `https://www.crunchbase.com/ownership/${slug}-${(s % 1000).toString(36)}`,
      publishedAt: day(20 + (s % 7)),
      tags: { keywords: ["ownership", "beneficial owner", "stake", "investor"] },
    }),
    toSignal(query, "crunchbase", {
      ...base,
      title: `${name} registers new holding entity in ${jurisdiction}`,
      snippet: `Corporate registry data shows ${name} established a new holding company domiciled in ${jurisdiction}.`,
      url: `https://www.crunchbase.com/registry/${slug}-${jurisdiction.toLowerCase().replace(/\s+/g, "-")}`,
      publishedAt: day(33 + (s % 9)),
      tags: { keywords: ["registry", "re-domicile", "holding company", "jurisdiction"] },
    }),
  ];
}

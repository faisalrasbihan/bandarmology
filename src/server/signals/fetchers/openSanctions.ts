import { toSignal } from "../helpers";
import type { FetchQuery, Signal } from "../types";

const BASE_URL = "https://api.opensanctions.org/search/default";

interface OpenSanctionsResult {
  id: string;
  caption: string;
  schema: string;
  datasets?: string[];
  countries?: string[];
  topics?: string[];
  last_seen?: string;
}

/**
 * Public default index is usable with no signup for light/demo volume.
 * For sustained or production use, sign up for a free key at
 * https://www.opensanctions.org/api/ and set OPENSANCTIONS_API_KEY — if set,
 * it's sent as a bearer-style "ApiKey" header automatically.
 */
export async function fetchOpenSanctions(query: FetchQuery): Promise<Signal[]> {
  const params = new URLSearchParams({
    q: query.companyName,
    limit: String(query.maxResults ?? 10),
  });

  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = process.env.OPENSANCTIONS_API_KEY;
  if (apiKey) headers.Authorization = `ApiKey ${apiKey}`;

  const res = await fetch(`${BASE_URL}?${params.toString()}`, { headers });
  if (!res.ok) {
    throw new Error(
      `OpenSanctions request failed: ${res.status} ${res.statusText}. If this persists, ` +
        "set OPENSANCTIONS_API_KEY (see README setup section)."
    );
  }

  const data = (await res.json()) as { results?: OpenSanctionsResult[] };
  const fetchedAt = new Date().toISOString();

  return (data.results ?? []).map((r): Signal =>
    toSignal(query, "open_sanctions", {
      title: `${r.caption} — ${r.schema}${r.datasets?.length ? ` (${r.datasets.join(", ")})` : ""}`,
      url: `https://www.opensanctions.org/entities/${r.id}/`,
      publishedAt: r.last_seen ?? null,
      fetchedAt,
      tags: { countries: r.countries, keywords: r.topics ?? [] },
      raw: r as unknown as Record<string, unknown>,
    })
  );
}

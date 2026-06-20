import { randomUUID } from "crypto";
import type { FetchQuery, Signal } from "../types";

const BASE_URL = "https://api.gdeltproject.org/api/v2/doc/doc";

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string; // e.g. "20260619T120000Z"
  domain: string;
  language: string;
  sourcecountry?: string;
}

/**
 * No API key or setup required. GDELT's DOC 2.0 API is public. It is, however,
 * informally rate-limited and occasionally returns an HTML error page instead
 * of JSON when overloaded — callers should treat a JSON parse failure as a
 * transient error, not a code bug.
 */
export async function fetchGdelt(query: FetchQuery): Promise<Signal[]> {
  const terms = [query.companyName, ...(query.aliases ?? [])];
  const quoted = terms.map((t) => (t.includes(" ") ? `"${t}"` : t));
  const searchTerm = quoted.length > 1 ? `(${quoted.join(" OR ")})` : quoted[0];

  const params = new URLSearchParams({
    query: searchTerm,
    mode: "ArtList",
    format: "json",
    maxrecords: String(Math.min(query.maxResults ?? 25, 250)),
    sort: "DateDesc",
  });

  const res = await fetch(`${BASE_URL}?${params.toString()}`, {
    headers: { "User-Agent": "amina-risk-profiling/0.1 (+hackathon)" },
  });
  if (!res.ok) {
    throw new Error(`GDELT request failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  let data: { articles?: GdeltArticle[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("GDELT returned a non-JSON response (likely rate-limited) — retry later");
  }

  const fetchedAt = new Date().toISOString();
  return (data.articles ?? []).map((a): Signal => ({
    id: randomUUID(),
    entityHint: query.companyName,
    source: "gdelt",
    title: a.title,
    url: a.url,
    publishedAt: parseGdeltDate(a.seendate),
    fetchedAt,
    tags: {
      sectors: query.sectors ?? [],
      countries: a.sourcecountry ? [a.sourcecountry] : query.countries ?? [],
      keywords: [],
    },
    raw: a as unknown as Record<string, unknown>,
  }));
}

function parseGdeltDate(seendate: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seendate);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString();
}

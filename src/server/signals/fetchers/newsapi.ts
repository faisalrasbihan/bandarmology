import { buildSearchTerm, toSignal } from "../helpers";
import type { FetchQuery, Signal } from "../types";

const BASE_URL = "https://newsapi.org/v2/everything";

interface NewsApiArticle {
  title: string;
  description?: string;
  url: string;
  publishedAt?: string;
  source?: { name?: string };
}

/**
 * Requires a free NEWSAPI_API_KEY (newsapi.org). Unlike Google News RSS / GDELT,
 * NewsAPI has no usable unauthenticated tier, so a missing key is a hard error
 * for this source rather than a degraded-but-working call — it's still caught
 * by fetchAllSignals's Promise.allSettled and surfaced as a per-source error.
 */
export async function fetchNewsApi(query: FetchQuery): Promise<Signal[]> {
  const apiKey = process.env.NEWSAPI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "NEWSAPI_API_KEY is not set. Sign up for a free key at https://newsapi.org/register " +
        "and set it in .env.local."
    );
  }

  const params = new URLSearchParams({
    q: buildSearchTerm(query),
    sortBy: "publishedAt",
    language: "en",
    pageSize: String(Math.min(query.maxResults ?? 25, 100)),
    apiKey,
  });

  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`NewsAPI request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { articles?: NewsApiArticle[] };
  const fetchedAt = new Date().toISOString();

  return (data.articles ?? []).map((a): Signal =>
    toSignal(query, "newsapi", {
      title: a.title,
      snippet: a.description,
      url: a.url,
      publishedAt: a.publishedAt ?? null,
      fetchedAt,
      raw: a as unknown as Record<string, unknown>,
    })
  );
}

import { buildKeywordList, toSignal } from "../helpers";
import type { FetchQuery, Signal } from "../types";

const BASE_URL = "http://api.mediastack.com/v1/news";

interface MediastackArticle {
  title: string;
  description?: string;
  url: string;
  published_at?: string;
  source?: string;
  country?: string;
}

/**
 * Requires a free MEDIASTACK_API_KEY (mediastack.com). The free tier only
 * supports plain HTTP (not HTTPS), which is a vendor limitation, not a typo.
 */
export async function fetchMediastack(query: FetchQuery): Promise<Signal[]> {
  const apiKey = process.env.MEDIASTACK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MEDIASTACK_API_KEY is not set. Sign up for a free key at https://mediastack.com/signup/free " +
        "and set it in .env.local."
    );
  }

  const params = new URLSearchParams({
    access_key: apiKey,
    keywords: buildKeywordList(query),
    languages: "en",
    sort: "published_desc",
    limit: String(Math.min(query.maxResults ?? 25, 100)),
  });
  if (query.countries?.length) {
    params.set("countries", query.countries.join(","));
  }

  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Mediastack request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { data?: MediastackArticle[] };
  const fetchedAt = new Date().toISOString();

  return (data.data ?? []).map((a): Signal =>
    toSignal(query, "mediastack", {
      title: a.title,
      snippet: a.description,
      url: a.url,
      publishedAt: a.published_at ?? null,
      fetchedAt,
      tags: { countries: a.country ? [a.country] : undefined },
      raw: a as unknown as Record<string, unknown>,
    })
  );
}

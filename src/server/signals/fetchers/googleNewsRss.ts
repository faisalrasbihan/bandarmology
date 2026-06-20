import { randomUUID } from "crypto";
import { XMLParser } from "fast-xml-parser";
import type { FetchQuery, Signal } from "../types";

const BASE_URL = "https://news.google.com/rss/search";

interface RssItem {
  title?: unknown;
  link?: unknown;
  description?: unknown;
  pubDate?: unknown;
}

/**
 * No API key or setup required. Google News RSS is a public, unauthenticated
 * endpoint. Rate limits are undocumented and informal — keep volume modest
 * and add backoff if you see empty/blocked responses during a demo.
 */
export async function fetchGoogleNewsRss(query: FetchQuery): Promise<Signal[]> {
  const url = `${BASE_URL}?q=${encodeURIComponent(buildSearchTerm(query))}&hl=en-US&gl=US&ceid=US:en`;

  const res = await fetch(url, {
    headers: { "User-Agent": "amina-risk-profiling/0.1 (+hackathon)" },
  });
  if (!res.ok) {
    throw new Error(`Google News RSS request failed: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed: unknown = parser.parse(xml);
  const items = toArray<RssItem>(
    (parsed as { rss?: { channel?: { item?: RssItem | RssItem[] } } })?.rss?.channel?.item
  );

  const max = query.maxResults ?? 25;
  const fetchedAt = new Date().toISOString();

  return items.slice(0, max).map((item): Signal => {
    const pubDate = typeof item.pubDate === "string" ? item.pubDate : undefined;
    return {
      id: randomUUID(),
      entityHint: query.companyName,
      source: "google_news_rss",
      title: stripHtml(String(item.title ?? "")).trim(),
      snippet: item.description ? stripHtml(String(item.description)).trim() : undefined,
      url: String(item.link ?? "").trim(),
      publishedAt: pubDate ? safeIsoDate(pubDate) : null,
      fetchedAt,
      tags: {
        sectors: query.sectors ?? [],
        countries: query.countries ?? [],
        keywords: [],
      },
      raw: item as Record<string, unknown>,
    };
  });
}

function buildSearchTerm(query: FetchQuery): string {
  const terms = [query.companyName, ...(query.aliases ?? [])];
  const quoted = terms.map((t) => (t.includes(" ") ? `"${t}"` : t));
  return quoted.length > 1 ? `(${quoted.join(" OR ")})` : quoted[0];
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function safeIsoDate(value: string): string | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

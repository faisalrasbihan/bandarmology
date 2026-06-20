import { randomUUID } from "crypto";
import type { FetchQuery, Signal, SignalSource, SignalTags } from "./types";

/**
 * OR-joined, quoted boolean search term shared by the news fetchers
 * (Google News, GDELT, NewsAPI). Multi-word terms are quoted so they match as
 * phrases; multiple terms (company + aliases) are combined with OR.
 */
export function buildSearchTerm(query: FetchQuery): string {
  const terms = [query.companyName, ...(query.aliases ?? [])];
  const quoted = terms.map((t) => (t.includes(" ") ? `"${t}"` : t));
  return quoted.length > 1 ? `(${quoted.join(" OR ")})` : quoted[0];
}

/** Mediastack uses a comma-separated keyword list rather than boolean OR syntax. */
export function buildKeywordList(query: FetchQuery): string {
  return [query.companyName, ...(query.aliases ?? [])].join(",");
}

/**
 * Builds a normalized `Signal` from a fetcher's per-source fields, filling in
 * the parts that are identical across every fetcher (id, entityHint, tag
 * defaults). Keeps the one normalized output shape in a single place so it
 * can't drift between sources — the `Signal` boundary the architecture relies on.
 */
export function toSignal(
  query: FetchQuery,
  source: SignalSource,
  fields: {
    title: string;
    url: string;
    snippet?: string;
    publishedAt?: string | null;
    fetchedAt: string;
    tags?: Partial<SignalTags>;
    raw?: Record<string, unknown>;
  }
): Signal {
  return {
    id: randomUUID(),
    entityHint: query.companyName,
    source,
    title: fields.title,
    snippet: fields.snippet,
    url: fields.url,
    publishedAt: fields.publishedAt ?? null,
    fetchedAt: fields.fetchedAt,
    tags: {
      sectors: fields.tags?.sectors ?? query.sectors ?? [],
      countries: fields.tags?.countries ?? query.countries ?? [],
      keywords: fields.tags?.keywords ?? [],
    },
    raw: fields.raw,
  };
}

export type SignalSource =
  | "google_news_rss"
  | "gdelt"
  | "open_sanctions"
  | "newsapi"
  | "mediastack"
  | "crunchbase";

/** Tags used both to scope a fetch and to route a fetched item back to entities (see ARCHITECTURE.md). */
export interface SignalTags {
  sectors: string[];
  countries: string[];
  keywords: string[];
}

/** A single normalized item pulled from a public source, not yet confirmed to be about a specific entity. */
export interface Signal {
  id: string;
  /** The company name/alias used to retrieve this item — a hint, not a verified entity match. */
  entityHint: string;
  source: SignalSource;
  /** Other sources that independently reported the same underlying item, set by the dedupe store. */
  mergedSources?: SignalSource[];
  title: string;
  snippet?: string;
  url: string;
  publishedAt: string | null;
  fetchedAt: string;
  tags: SignalTags;
  raw?: Record<string, unknown>;
}

export interface FetchQuery {
  companyName: string;
  aliases?: string[];
  sectors?: string[];
  countries?: string[];
  maxResults?: number;
}

export interface FetchError {
  source: SignalSource;
  message: string;
}

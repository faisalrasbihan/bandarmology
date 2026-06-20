import { runStage1, type ClassifiedSignal } from "../filter";
import { fetchGdelt } from "./fetchers/gdelt";
import { fetchGoogleNewsRss } from "./fetchers/googleNewsRss";
import { fetchMediastack } from "./fetchers/mediastack";
import { fetchNewsApi } from "./fetchers/newsapi";
import { fetchOpenSanctions } from "./fetchers/openSanctions";
import { upsertSignals } from "./store";
import type { FetchError, FetchQuery, Signal, SignalSource } from "./types";

const FETCHERS: { source: SignalSource; run: (query: FetchQuery) => Promise<Signal[]> }[] = [
  { source: "google_news_rss", run: fetchGoogleNewsRss },
  { source: "gdelt", run: fetchGdelt },
  { source: "open_sanctions", run: fetchOpenSanctions },
  { source: "newsapi", run: fetchNewsApi },
  { source: "mediastack", run: fetchMediastack },
];

/**
 * Runs every fetcher concurrently and never lets one source's failure drop
 * the others — partial results plus a structured error list is more useful
 * for a risk pipeline than an all-or-nothing throw.
 */
export async function fetchAllSignals(
  query: FetchQuery
): Promise<{ signals: Signal[]; errors: FetchError[] }> {
  const results = await Promise.allSettled(FETCHERS.map((f) => f.run(query)));

  const signals: Signal[] = [];
  const errors: FetchError[] = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      signals.push(...result.value);
    } else {
      errors.push({
        source: FETCHERS[i].source,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  return { signals, errors };
}

/**
 * Fetches, stores, and triages: runs fetchAllSignals, upserts the results
 * into the dedupe store (see store.ts), then runs every newly-inserted
 * signal through Stage 1 (see ../filter) — a free, non-LLM cheap filter, so
 * running it on every ingest costs nothing. Use this from request handlers;
 * use fetchAllSignals directly only when you need raw, unstored fetch
 * results (e.g. tests).
 */
export async function ingestSignals(
  query: FetchQuery
): Promise<{ inserted: ClassifiedSignal[]; duplicates: number; errors: FetchError[] }> {
  const { signals, errors } = await fetchAllSignals(query);
  const { inserted, duplicates } = await upsertSignals(signals);
  const classified = await runStage1(inserted);
  return { inserted: classified, duplicates, errors };
}

export { fetchGdelt, fetchGoogleNewsRss, fetchOpenSanctions, fetchNewsApi, fetchMediastack };
export { getStoredSignals, getSignalsByIds } from "./store";
export * from "./types";

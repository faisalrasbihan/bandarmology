import { getSignalsByIds } from "../signals";
import type { SignalSource } from "../signals/types";

/** A citation expanded from a bare Signal.id into something a human can click through and verify. */
export interface ResolvedCitation {
  signalId: string;
  source: SignalSource | null;
  title: string | null;
  url: string | null;
  publishedAt: string | null;
  /** False when the cited id no longer resolves to a stored signal (e.g. it was purged). */
  resolved: boolean;
}

/**
 * Turns an alert's `citations` (bare Signal.ids) into title + url + source so a
 * reviewer can open the underlying article. Grounding is only useful if a human
 * can actually check it. An unresolvable id is surfaced with `resolved: false`
 * rather than dropped — a dangling citation is itself worth seeing.
 */
export async function resolveCitations(signalIds: string[]): Promise<ResolvedCitation[]> {
  const signals = await getSignalsByIds(signalIds);
  const byId = new Map(signals.map((s) => [s.id, s]));
  return signalIds.map((id) => {
    const s = byId.get(id);
    return {
      signalId: id,
      source: s?.source ?? null,
      title: s?.title ?? null,
      url: s?.url ?? null,
      publishedAt: s?.publishedAt ?? null,
      resolved: Boolean(s),
    };
  });
}

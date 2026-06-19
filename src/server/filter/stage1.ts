import type { Signal } from "../signals/types";
import { RISK_TAXONOMY, type RiskCategory } from "./taxonomy";

/**
 * Stage 1 cheap filter: rule/keyword match + lightweight lexical overlap
 * against the risk taxonomy. No network calls, no LLM — this is the "free"
 * triage step that runs on every ingested signal before anything reaches an
 * LLM, per ARCHITECTURE.md's staged-by-cost pipeline.
 *
 * "Lexical overlap" here is plain token-set Jaccard similarity, not a real
 * embedding model — it's a free, dependency-free stand-in that catches
 * paraphrases a strict keyword match would miss (e.g. "stepped down as CEO"
 * vs. the keyword "ceo resigns"), without the cost/latency of running an
 * embedding model. If recall turns out too low in practice, swapping this
 * function for a real local embedding model (e.g. transformers.js) is a
 * drop-in replacement — the call sites only depend on the score, not how
 * it's computed.
 */

export interface RiskMatch {
  categoryId: string;
  categoryLabel: string;
  score: number; // 0..1
  matchedKeywords: string[];
}

export interface Stage1Classification {
  passed: boolean;
  topMatch: RiskMatch | null;
  matches: RiskMatch[]; // all categories with score > 0, sorted desc by score
  classifiedAt: string;
}

const PASS_THRESHOLD = 0.3;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function matchKeywords(haystack: string, keywords: string[]): string[] {
  const lower = haystack.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

function scoreCategory(signalText: string, signalTokens: Set<string>, category: RiskCategory): RiskMatch {
  const matchedKeywords = matchKeywords(signalText, category.keywords);
  // Any exact keyword hit is a strong, explainable signal — base it high
  // enough to pass on its own, with diminishing returns for extra hits.
  const keywordScore = matchedKeywords.length > 0 ? Math.min(1, 0.5 + 0.1 * (matchedKeywords.length - 1)) : 0;

  const categoryTokens = tokenize([category.description, ...category.keywords].join(" "));
  // Lexical overlap alone (no exact keyword) maxes out below the keyword
  // floor — it's corroborating evidence, not as strong as a direct hit.
  const lexicalScore = Math.min(0.45, jaccard(signalTokens, categoryTokens) * 2);

  return {
    categoryId: category.id,
    categoryLabel: category.label,
    score: Math.max(keywordScore, lexicalScore),
    matchedKeywords,
  };
}

export function classifySignal(signal: Signal): Stage1Classification {
  const signalText = [signal.title, signal.snippet ?? "", signal.tags.keywords.join(" ")].join(" ");
  const signalTokens = tokenize(signalText);

  const matches = RISK_TAXONOMY.map((category) => scoreCategory(signalText, signalTokens, category))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);

  const topMatch = matches[0] ?? null;

  return {
    passed: (topMatch?.score ?? 0) >= PASS_THRESHOLD,
    topMatch,
    matches,
    classifiedAt: new Date().toISOString(),
  };
}

import { toSignal } from "../helpers";
import type { FetchQuery, Signal } from "../types";

/**
 * Social-media chatter as a Layer 1 public source. Social posts are the
 * *earliest, noisiest* risk signal — rumours and complaints often surface here
 * before any newswire picks them up — but they're low-reliability and usually a
 * single unverified source. That's intentional: Stage 1 lets them through on
 * keyword/sentiment, and Stage 2's corroboration-based confidence keeps a lone
 * tweet at low confidence until a real outlet corroborates it.
 *
 * No free, ToS-clean firehose exists, so this generates a *synthetic* feed
 * (deterministic per entity, stable URLs for idempotent dedupe, flagged
 * `raw.synthetic = true`). A real connector (X/Twitter API, Reddit API, or a
 * social-listening vendor like Brandwatch) would slot in here behind a key,
 * exactly like the Crunchbase fetcher — the normalized `Signal` shape is the
 * same regardless of where the post came from.
 */

/** Tiny deterministic hash so synthetic posts are stable per company name. */
function seedFrom(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Adverse themes social monitoring looks for — phrased so Stage 1's keyword /
// lexical filter scores them against the adverse-media / leadership taxonomy.
const RUMORS = [
  "accounting irregularities",
  "an undisclosed regulatory probe",
  "a looming liquidity crunch",
  "mass layoffs and executive resignations",
  "customer funds being frozen",
  "related-party deals kept off the books",
];

export async function fetchSocialMedia(query: FetchQuery): Promise<Signal[]> {
  // A real X/Reddit/social-listening connector would go here, gated on its key.
  return syntheticSocial(query);
}

function syntheticSocial(query: FetchQuery): Signal[] {
  const name = query.companyName;
  const s = seedFrom(name);
  const fetchedAt = new Date().toISOString();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const handle = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  const rumor = RUMORS[s % RUMORS.length];
  const rumor2 = RUMORS[(s >> 4) % RUMORS.length];
  const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString();
  const id = (n: number) => (s + n).toString(36);

  const base = {
    fetchedAt,
    raw: { synthetic: true, source: "social-synthetic" } as Record<string, unknown>,
  };

  return [
    toSignal(query, "social_media", {
      ...base,
      title: `X/Twitter @${handle}Watch: hearing serious concerns about ${name} — multiple people pointing to ${rumor}. Something's off 🚩`,
      snippet: `Unverified post gaining traction (1.2k reposts). Allegations of ${rumor} at ${name}; no official statement yet.`,
      url: `https://x.com/${handle}Watch/status/${id(1)}`,
      publishedAt: day(1 + (s % 3)),
      tags: { keywords: ["allegations", "rumor", "concerns", "social media", "adverse"] },
    }),
    toSignal(query, "social_media", {
      ...base,
      title: `Reddit r/finance: Is anyone else worried about ${name}? Ex-employee thread alleges ${rumor2}`,
      snippet: `A self-described former employee describes ${rumor2}. Thread has 340 comments; claims are unverified.`,
      url: `https://www.reddit.com/r/finance/comments/${id(2)}/worried_about_${slug}`,
      publishedAt: day(4 + (s % 4)),
      tags: { keywords: ["whistleblower", "complaint", "investigation", "scandal", "social media"] },
    }),
    toSignal(query, "social_media", {
      ...base,
      title: `StockTwits $${handle.toUpperCase()}: unusual chatter and volume — rumors of ${rumor}, sentiment turning sharply bearish`,
      snippet: `Spike in negative-sentiment posts about ${name} over 24h; speculation of ${rumor}.`,
      url: `https://stocktwits.com/symbol/${handle.toUpperCase()}/message/${id(3)}`,
      publishedAt: day(2 + (s % 5)),
      tags: { keywords: ["sentiment", "bearish", "rumor", "volatility", "social media"] },
    }),
  ];
}

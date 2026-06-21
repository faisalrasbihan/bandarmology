/**
 * Minimal data-minimization pass for Layer 2 fields that can carry natural-person
 * identity (UBO names in `KycBaseline.ownershipStructure`) before they enter an
 * LLM prompt sent to a third-party API. Layer 1 news text is deliberately left
 * alone — it's already public, and redacting it would break citation grounding.
 *
 * Heuristic, not real NER: matches 2-3 consecutive Title-Case words (e.g.
 * "Markus Braun"). Good enough to catch the seed/demo data's UBO names; will
 * miss single-word names and can false-positive on capitalized multi-word
 * phrases. Replace with a real NER pass if this goes past a hackathon demo.
 */

const NAME_PATTERN = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g;

// Title-Case phrases ending in one of these are an org/place, not a person
// (e.g. "SIX Swiss Exchange", "Lakeside Holdings") — skip redacting them.
const ORG_WORDS = new Set([
  "Exchange", "Holdings", "Trust", "Bank", "Group", "Partners", "Services",
  "Trading", "Logistics", "Supplies", "Components", "Securities", "Capital",
  "Markets", "Co", "Ltd", "LLC", "Inc", "Corp", "Company", "AG", "GmbH",
]);

export function redactOwnership(entries: string[]): string[] {
  const placeholders = new Map<string, string>();

  const redactEntry = (entry: string): string =>
    entry.replace(NAME_PATTERN, (match) => {
      const words = match.split(/\s+/);
      if (words.some((w) => ORG_WORDS.has(w))) return match;

      let placeholder = placeholders.get(match);
      if (!placeholder) {
        placeholder = `Individual-${placeholders.size + 1}`;
        placeholders.set(match, placeholder);
      }
      return placeholder;
    });

  return entries.map(redactEntry);
}

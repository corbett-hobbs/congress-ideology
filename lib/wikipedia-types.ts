/** What the profile header needs from a `wikipedia_summaries.json` record. */
export interface WikipediaBio {
  /** Trimmed lead text (pipeline/wikipedia/trim.ts). */
  extract: string;
  /** Canonical article URL, for the CC BY-SA attribution link. */
  url: string;
}

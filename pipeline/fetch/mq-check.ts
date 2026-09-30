/**
 * Pure helpers for the Martin-Quinn fetch (`mq.ts`) — split out so they are
 * unit-testable without running the fetch's top-level code.
 */

/** Columns the transform needs; a downloaded file must carry them to count as the real CSV. */
export const JUSTICES_HEADER = ["term", "justice", "justiceName", "post_mn", "post_sd", "post_med", "post_025", "post_975"];
export const COURT_HEADER = ["term", "med", "med_sd", "min", "max", "justice", "just_pr"];

/**
 * Does this response look like a bot-challenge / block page rather than data?
 * We never try to get past one — this only decides what to tell the operator.
 */
export function detectChallenge(status: number, contentType: string, body: string): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  const head = body.slice(0, 4096);
  return /just a moment/i.test(head) || /cf-chl|challenge-platform/i.test(head);
}

/** Header-line sniff: HTML never passes, and the required columns must all be present. */
export function looksLikeCsv(body: string, requiredColumns: readonly string[]): boolean {
  const first = body.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  if (first.trimStart().startsWith("<")) return false;
  const cols = first.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  return requiredColumns.every((c) => cols.includes(c));
}

/** Pull a label like "2024 Release 01" out of the release README, if present. */
export function releaseLabelFromReadme(text: string): string | null {
  return /\b(20\d{2}\s+Release\s+\d+)\b/i.exec(text)?.[1] ?? null;
}

/** Latest release-year folder name (a 4-digit year) among `names`, or null. */
export function latestReleaseYear(names: readonly string[]): number | null {
  const years = names.filter((n) => /^\d{4}$/.test(n)).map(Number);
  return years.length === 0 ? null : Math.max(...years);
}

export const MANUAL_INSTRUCTIONS = (year: number) =>
  `Download \`justices.csv\` and \`court.csv\` (and, if you can, \`README.txt\`) for the ${year} release from ` +
  `https://mqscores.wustl.edu/measures.php in a normal browser, place them in \`pipeline/raw/mq/${year}/\`, ` +
  `then run \`pnpm fetch:mq -- --adopt ${year}\` to record their hashes.`;

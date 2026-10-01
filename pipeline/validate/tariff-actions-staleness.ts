import { readFileSync } from "node:fs";
import { daysSinceReview, isReviewStale, TARIFF_ACTIONS_STALE_DAYS } from "../../lib/tariff-actions-entities";

/**
 * Exits 1 when the curated tariff timeline has not been reviewed within
 * TARIFF_ACTIONS_STALE_DAYS. The weekly workflow (.github/workflows/tariff-actions-review.yml)
 * runs this and opens an issue on failure; it never blocks a deploy.
 */
const file = JSON.parse(readFileSync("pipeline/output/tariff_actions.json", "utf8")) as { last_reviewed: string };
const today = new Date().toISOString().slice(0, 10);
const days = daysSinceReview(file.last_reviewed, today);
if (isReviewStale(file.last_reviewed, today)) {
  console.error(`tariff_actions.json was last reviewed ${file.last_reviewed}, ${days} days ago (limit ${TARIFF_ACTIONS_STALE_DAYS}).`);
  process.exit(1);
}
console.log(`tariff_actions.json reviewed ${file.last_reviewed} (${days} days ago, limit ${TARIFF_ACTIONS_STALE_DAYS}).`);

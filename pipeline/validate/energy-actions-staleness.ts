import { readFileSync } from "node:fs";
import { daysSinceEnergyReview, ENERGY_ACTIONS_STALE_DAYS, isEnergyReviewStale } from "../../lib/energy-actions-entities";

/**
 * Exits 1 when the curated energy timeline has not been reviewed within ENERGY_ACTIONS_STALE_DAYS.
 * The weekly workflow (.github/workflows/energy-actions-review.yml) runs this and opens an issue on
 * failure; it never blocks a deploy.
 */
const file = JSON.parse(readFileSync("pipeline/output/energy_actions.json", "utf8")) as { last_reviewed: string };
const today = new Date().toISOString().slice(0, 10);
const days = daysSinceEnergyReview(file.last_reviewed, today);
if (isEnergyReviewStale(file.last_reviewed, today)) {
  console.error(`energy_actions.json was last reviewed ${file.last_reviewed}, ${days} days ago (limit ${ENERGY_ACTIONS_STALE_DAYS}).`);
  process.exit(1);
}
console.log(`energy_actions.json reviewed ${file.last_reviewed} (${days} days ago, limit ${ENERGY_ACTIONS_STALE_DAYS}).`);

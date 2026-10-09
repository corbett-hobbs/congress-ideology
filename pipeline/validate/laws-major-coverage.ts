import { readFileSync } from "node:fs";
import { congressesAwaitingMayhew, ordinal } from "../../lib/laws-entities";

/**
 * Exits 1 when a Congress has ended and Mayhew's important-enactment lists do not cover it yet, so its laws still read
 * "not yet assessed". The weekly workflow (.github/workflows/laws-major-review.yml) runs this and opens an issue on
 * failure; it never blocks a deploy and never edits data. No provisional flag ships (Session 3b was a no-go), so there
 * are no provisional laws to flip: when the list arrives the fix is to add its entries to
 * pipeline/reference/mayhew-major-laws.json and re-run the transform.
 */
const meta = JSON.parse(readFileSync("pipeline/output/laws_meta.json", "utf8")) as { major_covered_through_congress: number };
const today = new Date().toISOString().slice(0, 10);
const waiting = congressesAwaitingMayhew(meta.major_covered_through_congress, today);
if (waiting.length > 0) {
  console.error(`Mayhew's lists cover through the ${ordinal(meta.major_covered_through_congress)} Congress; ${waiting.map(ordinal).join(", ")} ha${waiting.length > 1 ? "ve" : "s"} ended (${today}) with no list in the data.`);
  process.exit(1);
}
console.log(`Mayhew's lists cover through the ${ordinal(meta.major_covered_through_congress)} Congress; no ended Congress is waiting (${today}).`);

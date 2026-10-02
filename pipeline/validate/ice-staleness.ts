import { readFileSync } from "node:fs";
import { expectedFinalFiscalYear, iceCatalog, latestFinalFiscalYear } from "../../lib/enforcement-entities";

/**
 * Exits 1 when ICE should have locked a fiscal year's removals that the catalog does not yet carry as
 * `final` (a missing year, or one still `preliminary`). The annual workflow
 * (.github/workflows/ice-annual-review.yml) runs this and opens an issue on failure; it never blocks a deploy.
 */
const catalog = iceCatalog.parse(JSON.parse(readFileSync("pipeline/reference/ice-removals-catalog.json", "utf8")));
const today = new Date().toISOString().slice(0, 10);
const expected = expectedFinalFiscalYear(today);
const have = latestFinalFiscalYear(catalog.years);
if (have === null || have < expected) {
  console.error(`The catalog's newest final fiscal year is ${have ?? "none"}; FY${expected} should be locked by now (${today}).`);
  process.exit(1);
}
console.log(`The catalog's newest final fiscal year is FY${have} (expected FY${expected} by ${today}).`);

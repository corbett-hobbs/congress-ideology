import { download, logResult, RAW_DIR, run } from "./lib";

/**
 * @unitedstates/congress-legislators — biographical data and, crucially, the
 * per-legislator id blocks that map Voteview's `icpsr` to the canonical
 * `bioguide_id` (see docs/DATA_CONVENTIONS.md).
 *
 * Fetched from the upstream repo's `main` branch. Both current and historical
 * files are needed: Voteview's data spans 1789-present, so the crosswalk has to
 * cover historical members too.
 */
const BASE =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main";

const SOURCES = [
  {
    url: `${BASE}/legislators-current.yaml`,
    dest: `${RAW_DIR}/congress-legislators/legislators-current.yaml`,
  },
  {
    url: `${BASE}/legislators-historical.yaml`,
    dest: `${RAW_DIR}/congress-legislators/legislators-historical.yaml`,
  },
];

await run("legislators", async () => {
  for (const { url, dest } of SOURCES) {
    logResult(await download(url, dest));
  }
});

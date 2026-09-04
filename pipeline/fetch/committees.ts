import { download, logResult, RAW_DIR, run } from "./lib";

/**
 * @unitedstates/congress-legislators — committees and their rosters.
 *
 * `committees-current.yaml` is the list of standing House / Senate / joint
 * committees (each with its `subcommittees`); `committee-membership-current.yaml`
 * is the roster, keyed by THOMAS id. Both cover the **current Congress only** —
 * there is no historical committee-membership file — which is why the whole
 * committees feature is pinned to the latest Congress.
 *
 * Fetched from the upstream repo's `main` branch, same direct-fetch, no-fork
 * convention as `legislators.ts`.
 */
const BASE =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main";

const SOURCES = [
  {
    url: `${BASE}/committees-current.yaml`,
    dest: `${RAW_DIR}/congress-legislators/committees-current.yaml`,
  },
  {
    url: `${BASE}/committee-membership-current.yaml`,
    dest: `${RAW_DIR}/congress-legislators/committee-membership-current.yaml`,
  },
];

await run("committees", async () => {
  for (const { url, dest } of SOURCES) {
    logResult(await download(url, dest));
  }
});

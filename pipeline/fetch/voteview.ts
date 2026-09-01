import { download, logResult, RAW_DIR, run } from "./lib";

/**
 * Voteview roll-call database — member-level DW-NOMINATE scores and the party
 * reference table, all Congresses, both chambers.
 *
 * Fetched directly from voteview.com (no fork or mirror). Files land in
 * pipeline/raw/voteview/ and are committed; freshness is checked weekly by
 * .github/workflows/voteview-freshness.yml.
 */
const SOURCES = [
  {
    url: "https://voteview.com/static/data/out/members/HSall_members.csv",
    dest: `${RAW_DIR}/voteview/HSall_members.csv`,
  },
  {
    url: "https://voteview.com/static/data/out/parties/HSall_parties.csv",
    dest: `${RAW_DIR}/voteview/HSall_parties.csv`,
  },
];

await run("voteview", async () => {
  for (const { url, dest } of SOURCES) {
    logResult(await download(url, dest));
  }
});

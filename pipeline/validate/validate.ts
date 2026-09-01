import { RAW_DIR } from "../fetch/lib";
import {
  legislator,
  voteviewMemberRow,
  voteviewPartyRow,
} from "./schemas";
import { readCsvRows, readYamlList, step, validateAll } from "./lib";

/**
 * Schema-check the raw snapshots in pipeline/raw/ before the transform stage
 * touches them. Minimal for now (see schemas.ts); the point is that malformed
 * data fails here, loudly, rather than producing a broken page later.
 */

const VOTEVIEW = `${RAW_DIR}/voteview`;
const LEGISLATORS = `${RAW_DIR}/congress-legislators`;

console.log("validate");

await step("voteview/HSall_members.csv", async () => {
  const file = `${VOTEVIEW}/HSall_members.csv`;
  const rows = await readCsvRows(file);
  validateAll(file, rows, voteviewMemberRow, (row, i) => {
    const r = row as Record<string, string>;
    return `row ${i + 2} (icpsr ${r.icpsr}, "${r.bioname}")`;
  });
  return rows.length;
});

await step("voteview/HSall_parties.csv", async () => {
  const file = `${VOTEVIEW}/HSall_parties.csv`;
  const rows = await readCsvRows(file);
  validateAll(file, rows, voteviewPartyRow, (_row, i) => `row ${i + 2}`);
  return rows.length;
});

for (const name of ["legislators-current.yaml", "legislators-historical.yaml"]) {
  await step(`congress-legislators/${name}`, async () => {
    const file = `${LEGISLATORS}/${name}`;
    const rows = await readYamlList(file);
    validateAll(file, rows, legislator, (row, i) => {
      const id = (row as { id?: { bioguide?: string } }).id?.bioguide ?? "?";
      return `entry ${i} (bioguide ${id})`;
    });
    return rows.length;
  });
}

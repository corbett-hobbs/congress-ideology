import { RAW_DIR } from "../fetch/lib";
import { legislator, voteviewMemberRow, voteviewPartyRow } from "./schemas";
import {
  assertUnique,
  readCsvRows,
  readYamlList,
  step,
  validateAll,
} from "./lib";

/**
 * Schema-check the raw snapshots in pipeline/raw/ before the transform stage
 * reads them. Catches missing required fields, malformed numbers (e.g. a
 * DW-NOMINATE coordinate outside [-1, 1]), and duplicate keys where uniqueness
 * is expected. A failure exits non-zero and names the file, row, and reason.
 */

const VOTEVIEW = `${RAW_DIR}/voteview`;
const LEGISLATORS = `${RAW_DIR}/congress-legislators`;

console.log("validate");

await step("voteview/HSall_members.csv", async () => {
  const file = `${VOTEVIEW}/HSall_members.csv`;
  const rows = validateAll(
    file,
    await readCsvRows(file),
    voteviewMemberRow,
    (row, i) => {
      const r = row as Record<string, string>;
      return `row ${i + 2} (icpsr ${r.icpsr}, congress ${r.congress}, "${r.bioname}")`;
    },
  );
  assertUnique(
    file,
    rows,
    (r) => `${r.icpsr}|${r.congress}|${r.chamber}`,
    (r) => `${r.bioname} (icpsr ${r.icpsr}, congress ${r.congress}, ${r.chamber})`,
  );
  return `${rows.length} rows ok, (icpsr, congress, chamber) unique`;
});

await step("voteview/HSall_parties.csv", async () => {
  const file = `${VOTEVIEW}/HSall_parties.csv`;
  const rows = validateAll(
    file,
    await readCsvRows(file),
    voteviewPartyRow,
    (_row, i) => `row ${i + 2}`,
  );
  assertUnique(
    file,
    rows,
    (r) => `${r.congress}|${r.chamber}|${r.party_code}`,
    (r) => `congress ${r.congress}, ${r.chamber}, party ${r.party_code} (${r.party_name})`,
  );
  return `${rows.length} rows ok, (congress, chamber, party_code) unique`;
});

const legislatorRows: { file: string; bioguide: string; name: string }[] = [];

for (const name of ["legislators-current.yaml", "legislators-historical.yaml"]) {
  await step(`congress-legislators/${name}`, async () => {
    const file = `${LEGISLATORS}/${name}`;
    const rows = validateAll(file, await readYamlList(file), legislator, (row, i) => {
      const id = (row as { id?: { bioguide?: string } }).id?.bioguide ?? "?";
      return `entry ${i} (bioguide ${id})`;
    });
    for (const r of rows) {
      legislatorRows.push({
        file,
        bioguide: r.id.bioguide,
        name: [r.name.first, r.name.last].join(" "),
      });
    }
    return `${rows.length} legislators ok`;
  });
}

await step("congress-legislators: bioguide uniqueness across both files", async () => {
  assertUnique(
    "congress-legislators/*.yaml",
    legislatorRows,
    (r) => r.bioguide,
    (r) => `${r.name} [${r.bioguide}] from ${r.file}`,
  );
  return `${legislatorRows.length} bioguide ids unique`;
});

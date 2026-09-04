import { RAW_DIR } from "../fetch/lib";
import {
  legislator,
  rawCommittee,
  rawCommitteeMember,
  voteviewMemberRow,
  voteviewPartyRow,
} from "./schemas";
import {
  assertUnique,
  readCsvRows,
  readYamlDoc,
  readYamlList,
  step,
  validateAll,
  ValidationError,
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

const knownBioguides = new Set(legislatorRows.map((r) => r.bioguide));

let committeeIds = new Set<string>();
await step("congress-legislators/committees-current.yaml", async () => {
  const file = `${LEGISLATORS}/committees-current.yaml`;
  const rows = validateAll(file, await readYamlList(file), rawCommittee, (row, i) => {
    const id = (row as { thomas_id?: string }).thomas_id ?? "?";
    return `entry ${i} (thomas_id ${id})`;
  });
  assertUnique(
    file,
    rows,
    (r) => r.thomas_id,
    (r) => `${r.name} [${r.thomas_id}]`,
  );
  committeeIds = new Set(rows.map((r) => r.thomas_id));
  return `${rows.length} committees ok (${rows.filter((r) => r.type === "house").length} house, ${rows.filter((r) => r.type === "senate").length} senate, ${rows.filter((r) => r.type === "joint").length} joint)`;
});

await step("congress-legislators/committee-membership-current.yaml", async () => {
  const file = `${LEGISLATORS}/committee-membership-current.yaml`;
  const doc = await readYamlDoc(file);
  if (doc == null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new ValidationError(file, "document", "expected a YAML mapping of committee id -> members");
  }
  let rosterRows = 0;
  let unknownBioguides = 0;
  for (const [key, members] of Object.entries(doc as Record<string, unknown>)) {
    if (!Array.isArray(members)) {
      throw new ValidationError(file, `key ${key}`, "expected a list of members");
    }
    // Subcommittee rosters are keyed <parent><digits>; only parent committees
    // must resolve to a committees-current.yaml entry.
    const isParentKey = /^[A-Z0-9]{4}$/.test(key);
    if (isParentKey && !committeeIds.has(key)) {
      throw new ValidationError(
        file,
        `key ${key}`,
        "roster for a committee not in committees-current.yaml",
      );
    }
    const validated = validateAll(
      file,
      members,
      rawCommitteeMember,
      (row, i) => {
        const b = (row as { bioguide?: string }).bioguide ?? "?";
        return `${key}[${i}] (bioguide ${b})`;
      },
    );
    for (const m of validated) {
      rosterRows += 1;
      if (!knownBioguides.has(m.bioguide)) unknownBioguides += 1;
    }
  }
  if (unknownBioguides > 0) {
    throw new ValidationError(
      file,
      "bioguide resolution",
      `${unknownBioguides} roster member(s) have a bioguide not present in congress-legislators`,
    );
  }
  return `${rosterRows} roster rows ok, every bioguide resolves`;
});

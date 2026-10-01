import { RAW_DIR } from "../fetch/lib";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { justice as justiceSchema, justiceBio } from "../../lib/court-entities";
import {
  legislator,
  wikipediaSummary,
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

// Our own output, not a raw snapshot — but it is committed and written by a
// scheduled job (fetch:wikipedia), so CI re-checks it on every push.
await step("output/wikipedia_summaries.json", async () => {
  const file = "pipeline/output/wikipedia_summaries.json";
  const rows = validateAll(
    file,
    JSON.parse(await readFile(file, "utf8")) as unknown[],
    wikipediaSummary,
    (row, i) => `record ${i} (bioguide ${(row as { bioguide_id?: string }).bioguide_id ?? "?"})`,
  );
  assertUnique(file, rows, (r) => r.bioguide_id, (r) => `${r.title} [${r.bioguide_id}]`);
  const unknown = rows.filter((r) => !knownBioguides.has(r.bioguide_id));
  if (unknown.length > 0) {
    throw new ValidationError(
      file,
      "bioguide resolution",
      `${unknown.length} record(s) have a bioguide not present in congress-legislators: ${unknown.map((r) => r.bioguide_id).join(", ")}`,
    );
  }
  return `${rows.length} records ok, bioguide_id unique and resolves`;
});

// Written by fetch:justice-bios (committed, like wikipedia_summaries.json), so CI
// re-checks it on every push: every row resolves to a justice, one row each,
// and every photo it names is on disk.
await step("output/court/justice_bios.json", async () => {
  const file = "pipeline/output/court/justice_bios.json";
  const rows = validateAll(
    file,
    JSON.parse(await readFile(file, "utf8")) as unknown[],
    justiceBio,
    (row, i) => `record ${i} (justice ${(row as { justice_id?: number }).justice_id ?? "?"})`,
  );
  assertUnique(file, rows, (r) => String(r.justice_id), (r) => `${r.title} [${r.justice_id}]`);
  const known = new Set(
    (JSON.parse(await readFile("pipeline/output/court/justices.json", "utf8")) as unknown[]).map(
      (j) => justiceSchema.parse(j).justice_id,
    ),
  );
  const unknown = rows.filter((r) => !known.has(r.justice_id));
  if (unknown.length > 0) {
    throw new ValidationError(file, "justice resolution", `${unknown.length} record(s) name a justice_id not in justices.json: ${unknown.map((r) => r.justice_id).join(", ")}`);
  }
  const missing = rows.filter((r) => r.photo && !existsSync(`public${r.photo.path}`));
  if (missing.length > 0) {
    throw new ValidationError(file, "photo files", `missing on disk: ${missing.map((r) => r.photo!.path).join(", ")}`);
  }
  const review = rows.filter((r) => r.needs_review);
  if (review.length > 0) {
    throw new ValidationError(file, "needs_review", `unresolved needs_review: ${review.map((r) => r.justice_id).join(", ")}`);
  }
  return `${rows.length} records ok, ${rows.filter((r) => r.photo).length} photos on disk`;
});

// --- Supreme Court track: raw inputs (Martin-Quinn + FJC bios) ---------------
// Cheap structural checks only; the full identity / crosswalk / sanity
// validation lives in transform/court.ts and runs on every `pnpm transform`.
await step("mq/<latest>: justices.csv + court.csv structure", async () => {
  const { readdir } = await import("node:fs/promises");
  const { COURT_HEADER, JUSTICES_HEADER, latestReleaseYear } = await import("../fetch/mq-check");
  const year = latestReleaseYear(await readdir(`${RAW_DIR}/mq`));
  if (year === null) throw new ValidationError(`${RAW_DIR}/mq`, "release folder", "no <year>/ folder found");
  const dir = `${RAW_DIR}/mq/${year}`;
  const check = async (name: string, cols: string[]) => {
    const rows = await readCsvRows(`${dir}/${name}`);
    const have = new Set(Object.keys(rows[0] ?? {}));
    const missing = cols.filter((c) => !have.has(c));
    if (missing.length > 0) throw new ValidationError(`${dir}/${name}`, "header", `missing columns: ${missing.join(", ")}`);
    return rows.length;
  };
  const j = await check("justices.csv", JUSTICES_HEADER);
  const c = await check("court.csv", COURT_HEADER);
  return `release ${year}: ${j} justice-term rows, ${c} court rows`;
});

await step("fjc: federal-judicial-service.csv + demographics.csv structure", async () => {
  const need = {
    "federal-judicial-service.csv": ["nid", "Court Name", "Appointing President", "Party of Appointing President", "Commission Date", "Senior Status Date", "Termination Date"],
    "demographics.csv": ["nid", "Last Name", "First Name", "Birth Year", "Death Year"],
  };
  let n = 0;
  for (const [name, cols] of Object.entries(need)) {
    const rows = await readCsvRows(`${RAW_DIR}/fjc/${name}`);
    const have = new Set(Object.keys(rows[0] ?? {}));
    const missing = cols.filter((c) => !have.has(c));
    if (missing.length > 0) throw new ValidationError(`${RAW_DIR}/fjc/${name}`, "header", `missing columns: ${missing.join(", ")}`);
    n += rows.length;
  }
  return `${n} rows, required columns present`;
});

// --- Executive orders track --------------------------------------------------
// The raw Federal Register snapshot: schema, one row per EO number, every
// signing date inside a tenure whose president matches the Federal Register's,
// eo_number monotonic with signing_date (known publication-order exceptions
// allowlisted), every EO has a cached topic, and the count anchors.
// The full build is `transform/executive-orders-run.ts`; this is the same pure
// checks, run on the raw input before anything downstream reads it.
await step("federal-register/executive_orders.json", async () => {
  const { administration, executiveOrder } = await import("../../lib/executive-orders-entities");
  const { ADMINISTRATIONS } = await import("../transform/administrations");
  const { readRaw, readCache } = await import("../transform/executive-orders-run");
  const ex = await import("../transform/executive-orders");
  const administrations = ADMINISTRATIONS.map((a) => administration.parse(a));
  const norm = ex.normalizeRaw(await readRaw());
  const rows = ex
    .buildExecutiveOrders(norm, administrations, await readCache())
    .map((r) => executiveOrder.parse(r));
  const s = ex.validateExecutiveOrders(rows, administrations);
  return `${s.count} EOs ok (${s.firstSigning}..${s.lastSigning}), eo_number unique + monotonic (${s.explainedOutOfOrder.length} known publication-order exceptions), every topic cached, anchors ok (Biden ${s.bidenCount}, Trump 2025 ${s.trump2025Count}, 2025 total ${s.total2025})`;
});

// Our own output, committed — re-checked on every push like wikipedia_summaries.json.
await step("output/executive_orders.json + administrations.json", async () => {
  const { administration, executiveOrder } = await import("../../lib/executive-orders-entities");
  const eoFile = "pipeline/output/executive_orders.json";
  const eos = validateAll(
    eoFile,
    JSON.parse(await readFile(eoFile, "utf8")) as unknown[],
    executiveOrder,
    (row, i) => `record ${i} (EO ${(row as { eo_number?: number }).eo_number ?? "?"})`,
  );
  assertUnique(eoFile, eos, (r) => String(r.eo_number), (r) => `EO ${r.eo_number} ${r.title}`);
  const adminFile = "pipeline/output/administrations.json";
  const admins = validateAll(
    adminFile,
    JSON.parse(await readFile(adminFile, "utf8")) as unknown[],
    administration,
    (row, i) => `record ${i} (${(row as { term_id?: string }).term_id ?? "?"})`,
  );
  assertUnique(adminFile, admins, (r) => r.term_id, (r) => `${r.president} ${r.term_id}`);
  const known = new Set(admins.map((a) => a.term_id));
  const dangling = eos.filter((e) => !known.has(e.term_id));
  if (dangling.length > 0) {
    throw new ValidationError(eoFile, "term_id resolution", `${dangling.length} EO(s) name a term_id not in administrations.json`);
  }
  return `${eos.length} EOs, ${admins.length} tenures ok; every term_id resolves`;
});

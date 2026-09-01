import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parse as parseCsv } from "csv-parse/sync";
import { parse as parseYaml } from "yaml";
import { z, type ZodType } from "zod";
import { RAW_DIR } from "../fetch/lib";
import {
  legislator as legislatorSchema,
  voteviewMemberRow,
  voteviewPartyRow,
  type Legislator,
  type VoteviewMemberRow,
} from "../validate/schemas";

export const OUTPUT_DIR = "pipeline/output";

const MEMBERS_CSV = `${RAW_DIR}/voteview/HSall_members.csv`;
const PARTIES_CSV = `${RAW_DIR}/voteview/HSall_parties.csv`;
const LEGISLATOR_YAML = [
  `${RAW_DIR}/congress-legislators/legislators-current.yaml`,
  `${RAW_DIR}/congress-legislators/legislators-historical.yaml`,
];

function parseRows<T>(file: string, rows: unknown[], schema: ZodType<T>): T[] {
  return rows.map((row, i) => {
    const r = schema.safeParse(row);
    if (!r.success) {
      throw new Error(
        `${file}: row ${i + 1} failed schema\n${z.prettifyError(r.error)}`,
      );
    }
    return r.data;
  });
}

/** All Voteview member rows (every chamber, including President), validated. */
export async function readVoteviewMembers(): Promise<VoteviewMemberRow[]> {
  const rows = parseCsv(await readFile(MEMBERS_CSV, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
  return parseRows(MEMBERS_CSV, rows, voteviewMemberRow);
}

export async function readVoteviewParties() {
  const rows = parseCsv(await readFile(PARTIES_CSV, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
  return parseRows(PARTIES_CSV, rows, voteviewPartyRow);
}

/** Current + historical legislators, concatenated, validated. */
export async function readLegislators(): Promise<Legislator[]> {
  const lists = await Promise.all(
    LEGISLATOR_YAML.map(async (file) => {
      const doc: unknown = parseYaml(await readFile(file, "utf8"));
      if (!Array.isArray(doc)) throw new Error(`${file}: expected a YAML list`);
      return parseRows(file, doc, legislatorSchema);
    }),
  );
  return lists.flat();
}

/**
 * Validate every row against `schema`, then write `name.json` to the output
 * directory as a JSON array with one row per line — valid JSON, but a data
 * change shows as a line-level git diff instead of a reformatted blob.
 * Deterministic: same input -> identical bytes.
 */
export async function writeEntities<T>(
  name: string,
  schema: ZodType<T>,
  rows: readonly T[],
): Promise<number> {
  const lines = rows.map((row, i) => {
    const r = schema.safeParse(row);
    if (!r.success) {
      throw new Error(
        `${name}.json: row ${i} fails the entity schema\n${z.prettifyError(r.error)}\n${JSON.stringify(row)}`,
      );
    }
    return JSON.stringify(r.data);
  });
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    `${OUTPUT_DIR}/${name}.json`,
    lines.length === 0 ? "[]\n" : `[\n${lines.join(",\n")}\n]\n`,
  );
  return rows.length;
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(`${OUTPUT_DIR}/${name}`, JSON.stringify(value, null, 2) + "\n");
}

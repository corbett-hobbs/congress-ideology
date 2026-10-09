import { parse as parseCsv } from "csv-parse/sync";
import { z } from "zod";

/**
 * Voteview's roll-call file (`HSall_rollcalls.csv`: one row per roll call, every Congress) reduced to what the Laws track
 * cross-checks passage tallies against: the 93rd Congress on, no NOMINATE or text columns.
 */
export const ROLLCALLS_URL = "https://voteview.com/static/data/out/rollcalls/HSall_rollcalls.csv";
export const ROLLCALLS_FIRST_CONGRESS = 93;

/** `[congress, chamber ("H" | "S"), rollnumber, date, session, clerk_rollnumber, yea, nay, bill_number]`; blank session / clerk number = null. */
export type RollcallTuple = [number, "H" | "S", number, string, number | null, number | null, number, number, string];

const row = z.object({
  congress: z.coerce.number().int(),
  chamber: z.enum(["House", "Senate"]),
  rollnumber: z.coerce.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  session: z.string(),
  clerk_rollnumber: z.string(),
  yea_count: z.string(),
  nay_count: z.string(),
  bill_number: z.string(),
});

const intOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

/** Parse the CSV text; throws on a row the schema rejects, or a vote count that is blank for a Congress we keep. */
export function reduceRollcalls(csv: string): RollcallTuple[] {
  const out: RollcallTuple[] = [];
  for (const [i, r] of (parseCsv(csv, { columns: true, skip_empty_lines: true, bom: true }) as Record<string, string>[]).entries()) {
    if (Number(r.congress) < ROLLCALLS_FIRST_CONGRESS) continue;
    const p = row.safeParse(r);
    if (!p.success) throw new Error(`HSall_rollcalls.csv row ${i + 2} fails the schema: ${p.error.message.slice(0, 300)}`);
    const yea = intOrNull(p.data.yea_count);
    const nay = intOrNull(p.data.nay_count);
    if (yea === null || nay === null) throw new Error(`HSall_rollcalls.csv row ${i + 2} (${p.data.congress} ${p.data.chamber} ${p.data.rollnumber}) has no yea/nay count`);
    out.push([p.data.congress, p.data.chamber === "House" ? "H" : "S", p.data.rollnumber, p.data.date, intOrNull(p.data.session), intOrNull(p.data.clerk_rollnumber), yea, nay, p.data.bill_number.trim()]);
  }
  return out;
}

export const rollcallManifest = z.object({
  url: z.string(),
  source_bytes: z.number().int(),
  source_sha256: z.string(),
  rows: z.number().int(),
  first_congress: z.number().int(),
  last_date: z.object({ H: z.string(), S: z.string() }),
  fetched: z.string(),
});
export type RollcallManifest = z.infer<typeof rollcallManifest>;

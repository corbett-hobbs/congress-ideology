import { z } from "zod";
import { dayOfIso } from "./indicator-time";

/**
 * Chamber-majority reference table (`pipeline/reference/congress-control.json`).
 * Hand-curated with a primary-source citation per chamber (rows run from the 93rd Congress, 1973; the Economy and Trade charts clip them to their own 1991 axis) because roster counts
 * in terms.json cannot reliably say who held the majority (mid-Congress
 * replacements, caucusing independents, tie-breaking vice presidents).
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const congressControlRow = z.strictObject({
  chamber: z.enum(["house", "senate"]),
  from: isoDate,
  to: isoDate.nullable(),
  party: z.enum(["D", "R"]),
  congresses: z.string(),
  note: z.string().optional(),
});
export const congressControlFile = z.strictObject({
  _note: z.string(),
  sources: z.strictObject({ house: z.string(), senate: z.string() }),
  rows: z.array(congressControlRow),
});
export type CongressControlRow = z.infer<typeof congressControlRow>;

export interface ControlSpan {
  /** Inclusive start day, exclusive end day (axis days). */
  s: number;
  e: number;
  party: "D" | "R";
}

/** One chamber's spans on the shared axis, clipped to [0, span). Throws if rows are not contiguous. */
export function controlSpans(rows: readonly CongressControlRow[], chamber: "house" | "senate", span: number): ControlSpan[] {
  const mine = rows.filter((r) => r.chamber === chamber).sort((a, b) => a.from.localeCompare(b.from));
  const out: ControlSpan[] = [];
  let prevEnd: number | null = null;
  for (const r of mine) {
    const s = dayOfIso(r.from);
    const e = r.to === null ? span : dayOfIso(r.to) + 1;
    if (prevEnd !== null && s !== prevEnd) throw new Error(`congress-control: ${chamber} gap/overlap at ${r.from}`);
    prevEnd = e;
    // The first span drawn starts at axis day 0 (the Congress opens on day 2; the two days before it have the same majority).
    const cs = out.length === 0 ? 0 : Math.max(0, s);
    const ce = Math.min(span, e);
    if (ce <= cs) continue;
    const last = out[out.length - 1];
    // Rows before the axis starts are clipped away; two neighbouring rows of one party (a table that runs back to 1973) draw as one span.
    if (last && last.party === r.party && last.e === cs) last.e = ce;
    else out.push({ s: cs, e: ce, party: r.party });
  }
  if (out.length === 0) throw new Error(`congress-control: no ${chamber} rows`);
  return out;
}

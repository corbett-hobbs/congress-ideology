import type { ControlRow } from "@/components/charts/ControlRowsSvg";
import { ordinal } from "@/lib/demographics-chart";
import { openYear } from "@/lib/laws-derive";
import type { LawsPayload } from "@/lib/laws-types";

/** "1973–74" for the Congress at index `ci`. */
export const congressYears = (d: LawsPayload, ci: number): string => {
  const y = openYear(d.congresses[ci]!);
  return `${y}–${String(y + 1).slice(2)}`;
};

export const congressTitle = (d: LawsPayload, ci: number): string => `${ordinal(d.congresses[ci]!)} Congress`;

/** Tooltip subtitle: the years, whether the Congress is still in session, and who signed its laws. */
export function congressSub(d: LawsPayload, ci: number): string {
  const s = d.signedMost[ci]!;
  const signers = s.split.length > 1 ? `Signed by ${s.split.map((x) => `${x.president.split(" ").pop()} (${x.n})`).join(", ")}` : `Signed by ${s.president} (${s.party})`;
  return `${congressYears(d, ci)}${d.partial[ci] ? ", in session" : ""} · ${signers}`;
}

/** The House and Senate strips for the Congresses `[a, b]`, when the page's party-control box is ticked. */
export function controlRowsFor(d: LawsPayload, on: boolean, a: number, b: number): ControlRow[] | undefined {
  if (!on || d.control.house.length === 0) return undefined;
  return [
    { label: "House", parties: d.control.house.slice(a, b + 1) },
    { label: "Senate", parties: d.control.senate.slice(a, b + 1) },
  ];
}

export function EmptyWindow({ majorThrough }: { majorThrough: number }) {
  return (
    <p className="m-0 rounded-md border border-dashed border-line-strong p-4 text-[0.82rem] text-ink-muted">
      No assessed Congress falls in these years: major laws are assessed through the {ordinal(majorThrough)} Congress. Widen the years or untick Major laws.
    </p>
  );
}

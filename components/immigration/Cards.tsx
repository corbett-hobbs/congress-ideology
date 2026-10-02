import type { IceMarker, IceTerm, IceYear } from "@/lib/immigration-derive";

const BOX =
  "absolute z-[6] box-border rounded-lg border border-line-strong bg-surface px-3.5 py-3 shadow-[0_6px_20px_rgba(26,34,51,0.14)]";
const TOP = 30;

/** Card for a numbered definition-change marker. Never interactive. */
export function MarkerCard({ marker, width, left }: { marker: IceMarker; width: number; left: number }) {
  return (
    <div role="tooltip" className={`${BOX} pointer-events-none`} style={{ top: TOP, left, width }}>
      <div className="text-[0.82rem] font-semibold leading-[1.35] text-ink">{marker.title}</div>
      <div className="mt-1 text-[0.8rem] leading-[1.5] text-ink-muted">{marker.text}</div>
    </div>
  );
}

const fyRange = (fy: number) => `Oct 1, ${fy - 1} to Sep 30, ${fy}`;

/**
 * Card for one fiscal year: value, status, administration (with day split for
 * blended years), corroboration, source link, and any caveat that has no
 * numbered marker. Hover cards ignore the pointer; a pinned (tapped or
 * keyboard-opened) card takes it so the source link works.
 */
export function BarCard({
  year,
  terms,
  width,
  left,
  interactive,
}: {
  year: IceYear;
  terms: ReadonlyMap<string, IceTerm>;
  width: number;
  left: number;
  interactive: boolean;
}) {
  const president = terms.get(year.termId)?.president ?? "";
  return (
    <div
      role="tooltip"
      data-ice-hit
      className={`${BOX} ${interactive ? "" : "pointer-events-none"}`}
      style={{ top: TOP, left, width }}
    >
      <div className="font-mono text-[0.82rem] font-semibold text-ink">
        {`FY${year.fy} · ${year.value.toLocaleString("en-US")}`}
      </div>
      <div className="text-[0.74rem] leading-[1.5] text-ink-muted">{fyRange(year.fy)}</div>
      <div className="mt-1.5 text-[0.8rem] leading-[1.5] text-ink-muted">
        {year.blended ? year.days.map((d) => `${d.last} ${d.days} days`).join(" · ") : president}
      </div>
      <div className="text-[0.8rem] leading-[1.5] text-ink-muted">
        {`${year.status === "final" ? "Final" : "Preliminary"} · ${year.corroborated ? "Confirmed by a second source" : "Single source"}`}
      </div>
      {year.cardNotes.map((n) => (
        <p key={n.id} className="m-0 mt-1.5 text-[0.78rem] leading-[1.5] text-ink-muted">
          {n.text}
        </p>
      ))}
      <a
        href={year.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 block text-[0.78rem] leading-[1.45] text-accent underline-offset-2 hover:underline"
      >
        {year.source}
      </a>
    </div>
  );
}

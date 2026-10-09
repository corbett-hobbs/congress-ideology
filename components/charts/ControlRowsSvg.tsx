
export interface ControlRow {
  label: string;
  /** One party per slot. */
  parties: readonly ("D" | "R")[];
}

const ROW_H = 8;
const ROW_GAP = 2;

/** Height the rows take under a chart (rows plus the gap above them); 0 for none. */
export const controlRowsHeight = (rows: readonly ControlRow[] | undefined): number => (rows && rows.length ? 6 + rows.length * (ROW_H + ROW_GAP) : 0);

/**
 * Which party held each chamber, one thin strip per chamber with one cell per slot (a Congress), under a chart's
 * presidential-term band. Party colours are the same `--rep` / `--dem` as the term bands. Render inside the chart's
 * `<svg>`; `y` is the top of the first strip and the chamber names sit in the left gutter.
 */
export function ControlRowsSvg({ rows, x0, step, y }: { rows: readonly ControlRow[]; x0: number; step: number; y: number }) {
  return (
    <g transform={`translate(0,${y})`} aria-hidden>
      {rows.map((r, k) => (
        <g key={r.label} transform={`translate(0,${k * (ROW_H + ROW_GAP)})`}>
          <text x={x0 - 6} y={ROW_H - 0.5} textAnchor="end" className="fill-ink-faint text-[9px]">
            {r.label}
          </text>
          {r.parties.map((party, i) => (
            <rect key={i} x={x0 + i * step + 0.5} y={0} width={Math.max(0, step - 1)} height={ROW_H} style={{ fill: party === "R" ? "var(--rep)" : "var(--dem)" }} />
          ))}
        </g>
      ))}
    </g>
  );
}

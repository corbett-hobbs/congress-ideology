import { fmtShare } from "@/lib/chart-bars";
import { fmtAge, ordinal } from "@/lib/demographics-chart";
import type { DemoCongress } from "@/lib/demographics-types";

/** Three headline numbers for the latest Congress in the chosen chamber view. Every value comes from the payload. */
export function StatStrip({ row }: { row: DemoCongress }) {
  const women = row.women.D + row.women.R + row.women.O;
  const tiles = [
    { label: `Median age, ${ordinal(row.congress)} Congress`, value: fmtAge(row.ageAll.median), sub: `Democrats ${fmtAge(row.age.D.median)} · Republicans ${fmtAge(row.age.R.median)}` },
    { label: "Women", value: fmtShare(women / (row.seats || 1)), sub: `${women} of ${row.seats} members` },
    { label: "Average Congresses served", value: (row.servedSum / (row.seats || 1)).toFixed(1), sub: `${fmtShare(row.tenure[0] / (row.seats || 1))} are in their first Congress` },
  ];
  return (
    <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-[10px] border border-line bg-surface px-4 py-2.5 sm:py-3">
          <dt className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-ink-muted">{t.label}</dt>
          <dd className="m-0 mt-1 font-serif text-[1.5rem] sm:text-[1.9rem] font-medium leading-none tabular-nums text-ink">{t.value}</dd>
          <dd className="m-0 mt-1.5 text-[0.78rem] text-ink-muted">{t.sub}</dd>
        </div>
      ))}
    </dl>
  );
}

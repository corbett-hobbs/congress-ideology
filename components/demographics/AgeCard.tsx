"use client";

import { useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { PillGroup } from "@/components/charts/PillGroup";
import { MethodologyNote } from "@/components/MethodologyNote";
import { congressSpan, fmtAge, presidentById, readoutRow, type AgeMeasure } from "@/lib/demographics-chart";
import type { DemoCongress, DemoPresident } from "@/lib/demographics-types";
import { AgeChart } from "./AgeChart";
import { CongressReadout, TableView } from "./shared";

export function AgeCard({ rows, presidents, pin, onPin }: { rows: readonly DemoCongress[]; presidents: readonly DemoPresident[]; pin: number | null; onPin: (c: number | null) => void }) {
  const [measure, setMeasure] = useState<AgeMeasure>("median");
  const by = presidentById(presidents);
  const cur = readoutRow(rows, pin);
  const line = cur && {
    values: [`Democrats ${fmtAge(cur.age.D[measure])}`, `Republicans ${fmtAge(cur.age.R[measure])}`],
    date: congressSpan(cur),
    term: by.get(cur.termId)?.president,
  };
  return (
    <ChartCard
      title="Is Congress getting older?"
      lede="Age in years on the first day of each Congress, by caucus."
      action={
        <PillGroup
          ariaLabel="Age measure"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: "median", label: "Median" },
            { value: "average", label: "Average" },
          ]}
        />
      }
    >
      <CongressReadout line={line} pinned={pin !== null && !!cur && cur.congress === pin} onClear={() => onPin(null)} />
      <AgeChart rows={rows} presidents={presidents} measure={measure} pin={pin} onPin={onPin} />
      <MethodologyNote>
        <p>
          Age is exact on the day the Congress convened. Members with no recorded birthdate are left out, and independents who caucus with a party are grouped with it.
        </p>
      </MethodologyNote>
      <TableView
        head={["Congress", "Years", "President", "Dem. median", "Dem. average", "Rep. median", "Rep. average", "Members with a birthdate (Dem. / Rep.)"]}
        rows={[...rows].reverse().map((r) => [`${r.congress}th`, `${r.year}–${r.year + 1}`, by.get(r.termId)?.president ?? "", fmtAge(r.age.D.median), fmtAge(r.age.D.average), fmtAge(r.age.R.median), fmtAge(r.age.R.average), `${r.age.D.n} / ${r.age.R.n}`])}
      />
    </ChartCard>
  );
}

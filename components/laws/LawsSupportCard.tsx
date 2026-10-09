"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { LegendToggle } from "@/components/charts/LegendToggle";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { PillGroup } from "@/components/charts/PillGroup";
import { StackedArea } from "@/components/charts/StackedArea";
import { Swatch, TableView, TooltipCard } from "@/components/decisions/shared";
import { MethodologyNote } from "@/components/MethodologyNote";
import { buildStacks, fmtInt, fmtPct, median } from "@/lib/decisions-derive";
import { ordinal } from "@/lib/demographics-chart";
import type { SplitMode } from "@/lib/decisions-types";
import { SMALL_LAWS_MEDIAN, SUPPORT_COLORS, SUPPORT_ORDER, SUPPORT_LABELS, SUPPORT_SHORT, cellFor, filterGroups, filterLabel, noVoteShare, openYear, signedMostSegments } from "@/lib/laws-derive";
import type { BandCounts } from "@/lib/laws-types";
import { EmptyWindow, congressSub, congressTitle, controlRowsFor } from "./shared";
import { useLawsActions, useLawsValues } from "./LawsState";

const CAPTIONS: Record<SplitMode, readonly string[]> = {
  share: ["Share of laws by the closest recorded vote on final passage, percent", "Share of laws by vote, percent", "Share of laws, %"],
  count: ["Laws per Congress by the closest recorded vote on final passage", "Laws by closest vote", "Laws"],
};
const BANDS: number[] = [...SUPPORT_ORDER];
const share = (b: readonly number[], k: number): number => {
  const t = b[0]! + b[1]! + b[2]! + b[3]! + b[4]!;
  return t ? b[k]! / t : 0;
};

/**
 * Card 2: how broadly laws are supported. Each law sits in the band of the closest recorded final-passage vote it faced in
 * either chamber (voice vote or consent is its own band, at the top, next to the 90%+ band). The shared `StackedArea`, a Share / Number toggle, and a legend
 * whose entries isolate a band (rule 12c): the pick draws that band alone from zero, switches to the count view and also
 * narrows card 1; going back to Share clears it. Few laws per Congress (a thin area, or major laws only) get a note; the chart is never hidden.
 */
export function LawsSupportCard() {
  const { data, group, major, band: iso, control, window: win, hover, pin } = useLawsValues();
  const { moveHover, leaveHover, togglePin, pinCongress, clearPin, setBand } = useLawsActions();
  const [mode, setModeRaw] = useState<SplitMode>("share");
  const eff: SplitMode = iso !== null ? "count" : mode;
  const setMode = (m: SplitMode) => {
    setModeRaw(m);
    if (m === "share") setBand(null);
  };
  const pick = (k: number) => {
    setBand(iso === k ? null : k);
    setModeRaw("count");
  };

  const groups = useMemo(() => filterGroups(data, group), [data, group]);
  const idx = useMemo(() => Array.from({ length: Math.max(0, win[1] - win[0] + 1) }, (_, i) => win[0] + i), [win]);
  const congresses = useMemo(() => idx.map((ci) => data.congresses[ci]!), [idx, data]);
  const cells = useMemo<BandCounts[]>(() => idx.map((ci) => cellFor(data, ci, groups, major).bands), [idx, data, groups, major]);
  const segs = useMemo(() => signedMostSegments(data, idx), [data, idx]);
  const vis = useMemo(() => (iso === null ? BANDS : [iso]), [iso]);
  const stacks = useMemo(() => buildStacks(cells, eff, vis), [cells, eff, vis]);
  const ctl = controlRowsFor(data, control, win[0], win[1]);

  const sum: BandCounts = [0, 0, 0, 0, 0];
  cells.forEach((c) => c.forEach((v, k) => (sum[k]! += v)));
  const total = sum.reduce((a, b) => a + b, 0);
  const lo = idx.length ? openYear(data.congresses[idx[0]!]!) : 0;
  const hi = idx.length ? openYear(data.congresses[idx[idx.length - 1]!]!) + 1 : 0;
  const who = `${major ? "Major laws, " : ""}${filterLabel(data, group)}`;
  const lede = total
    ? `${who}, ${lo}–${hi}: ${fmtPct(share(sum, 0))} of ${fmtInt(total)} laws were passed by voice vote or consent in both chambers, ${fmtPct(share(sum, 4))} passed with at least 90% yes and ${fmtPct(share(sum, 1))} with under 60%.`
    : "No laws in this selection.";
  const thin = idx.length > 0 && median(cells.map((c) => c[0] + c[1] + c[2] + c[3] + c[4])) < SMALL_LAWS_MEDIAN;
  const pre2000 = data.congresses.filter((c) => openYear(c) < 2000);
  const lastPre = pre2000[pre2000.length - 1]!;

  return (
    <ChartCard
      tight
      title="How broadly are laws supported?"
      lede={lede}
      action={
        <PillGroup
          ariaLabel="Support measure"
          value={mode}
          onChange={setMode}
          options={[
            { value: "share", label: "Share" },
            { value: "count", label: "Number" },
          ]}
        />
      }
    >
      {idx.length === 0 ? (
        <EmptyWindow majorThrough={data.majorThrough} />
      ) : (
        <StackedArea
          slots={congresses}
          stacks={stacks}
          vis={vis}
          mode={eff}
          colors={SUPPORT_COLORS}
          shortLabels={SUPPORT_SHORT}
          longLabels={SUPPORT_LABELS}
          captions={CAPTIONS[eff]}
          segments={segs}
          slotYears={2}
          tickLabel={(c) => String(openYear(c))}
          controlRows={ctl}
          hover={hover}
          pin={pin}
          moveHover={moveHover}
          leaveHover={leaveHover}
          togglePin={togglePin}
          pinTerm={pinCongress}
          clearPin={clearPin}
          iso={iso}
          onIso={pick}
          ariaLabel="Stacked area chart of public laws by the closest recorded vote on final passage, one slot per Congress"
          pickLabel="Pick a Congress: arrow keys move the pin, Escape clears it"
          renderTooltip={(c) => {
            const ci = data.congresses.indexOf(c);
            const b = cells[idx.indexOf(ci)] ?? ([0, 0, 0, 0, 0] as BandCounts);
            const t = b[0] + b[1] + b[2] + b[3] + b[4];
            return (
              <TooltipCard title={congressTitle(data, ci)} sub={congressSub(data, ci)}>
                <div>{fmtInt(t)} laws</div>
                {[...BANDS].reverse().map((k) => (
                  <div key={k}>
                    <Swatch color={SUPPORT_COLORS[k]!} /> {SUPPORT_SHORT[k]}: {b[k]}
                    {t ? ` (${fmtPct(share(b, k))})` : ""}
                  </div>
                ))}
              </TooltipCard>
            );
          }}
        />
      )}
      <div className={`mt-2 ${LEGEND_ROW}`}>
        {BANDS.map((k) => (
          <LegendToggle key={k} active={iso === k} dimmed={iso !== null && iso !== k} onClick={() => pick(k)}>
            <span className={LEGEND_ITEM}>
              <Swatch color={SUPPORT_COLORS[k]!} />
              {SUPPORT_LABELS[k]}
            </span>
          </LegendToggle>
        ))}
      </div>
      {thin && <p className="m-0 mt-2 text-[0.78rem] leading-[1.45] text-ink-muted">Few laws per Congress in this selection, so shares swing widely. Read the trend, not individual Congresses.</p>}
      <MethodologyNote>
        <p>
          A law&rsquo;s band is the yes share (yes votes out of votes cast) of the closest recorded final-passage vote it faced in either chamber, so a 50&ndash;49 vote lands in &ldquo;under 60%&rdquo;. &ldquo;Voice vote or consent&rdquo; means the bill&rsquo;s action history shows no roll call on final passage in either chamber: a voice vote, unanimous consent, or, for most of the 1970s, no method stated. That is {fmtPct(noVoteShare(data, data.congresses[0]!, lastPre))} of the laws before 2000, so read the early years as &ldquo;what was recorded&rdquo;, not as how divided Congress was. Tallies come from the final-passage action in each bill&rsquo;s history and are checked against Voteview&rsquo;s roll calls; override votes do not set the band. The {ordinal(data.congresses[data.congresses.length - 1]!)} Congress is still in session, so its slot is partial.
        </p>
      </MethodologyNote>
      <TableView
        label="Table of laws per Congress by closest recorded vote"
        head={["Congress", "Opened", "Laws", ...BANDS.map((k) => SUPPORT_SHORT[k]!)]}
        rows={idx.map((ci, i) => [ordinal(data.congresses[ci]!), openYear(data.congresses[ci]!), cells[i]!.reduce((a, b) => a + b, 0), ...BANDS.map((k) => cells[i]![k]!)]).reverse()}
      />
    </ChartCard>
  );
}

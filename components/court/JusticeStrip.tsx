"use client";

import { useMemo } from "react";
import { scaleLinear } from "d3-scale";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import {
  fmtScore,
  isDimmed,
  isSeated,
  partyLabel,
  scoreAt,
  termLabel,
  type CourtFilter,
  type CourtJustice,
  type CourtPayload,
} from "@/lib/court-types";
import {
  layoutStrip,
  STRIP_GEOMETRY,
  type Box,
} from "@/lib/court-strip-layout";

const FALLBACK_W = 520;
const { height: H, axisY, dotR, labelH, fontSize, padX } = STRIP_GEOMETRY;
/** Conservative per-character width at `fontSize` (the layout test uses the same). */
const textWidth = (s: string) => s.length * 7.0;

type Mid = "left" | "joined" | null;
interface Tip {
  j: CourtJustice;
  score: number;
  mid: Mid;
  median: number | null;
}

const partyVar = (j: CourtJustice) => (j.party === "D" ? "var(--dem)" : "var(--rep)");

/**
 * "Where the justices stand": one dot per justice with a score in the selected
 * term on a single liberal–conservative axis. Geometry (beeswarm dodge and
 * label placement) is `lib/court-strip-layout.ts`; this renders it on the
 * shared chart primitives. Fixed height so the card — and the president card
 * stretched beside it — never changes size while the slider plays.
 */
export function JusticeStrip({
  data,
  term,
  filter,
  selectedId,
  onSelect,
}: {
  data: CourtPayload;
  term: number;
  filter: CourtFilter;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [wrapRef, measuredW] = useElementWidth<HTMLDivElement>();
  const W = measuredW || FALLBACK_W;
  const tip = useTooltip<Tip>();
  const rec = data.terms[term - data.firstTerm];

  const { layout, medianX } = useMemo(() => {
    const x = scaleLinear()
      .domain(data.domain)
      .range([padX, W - padX]);
    const mx = x(rec.median);
    const fixed: Box[] = [
      { x0: mx - 26, x1: mx + 26, y0: 0, y1: 16 },
      { x0: padX, x1: padX + 76, y0: H - 19, y1: H },
      { x0: W - padX - 108, x1: W - padX, y0: H - 19, y1: H },
    ];
    const items = data.justices
      .filter((j) => isSeated(j, term))
      .map((j) => ({ id: j.id, x: x(scoreAt(j, term)), label: j.short }));
    return {
      medianX: mx,
      layout: layoutStrip(items, {
        width: W,
        height: H,
        axisY,
        dotR,
        labelH,
        medianX: mx,
        fixed,
        textWidth,
      }),
    };
  }, [data, term, W, rec.median]);

  const byId = new Map(data.justices.map((j) => [j.id, j]));
  const labelFor = new Map(layout.labels.map((l) => [l.id, l]));
  const mid = (id: number): Mid =>
    rec.left.includes(id) ? "left" : rec.joined.includes(id) ? "joined" : null;

  const showTip = (id: number, e: React.PointerEvent) => {
    const j = byId.get(id) as CourtJustice;
    tip.show(
      {
        j,
        score: scoreAt(j, term),
        mid: mid(id),
        median: id === rec.medianJusticeId ? rec.medianProb : null,
      },
      e,
    );
  };

  const mClamped = Math.max(26, Math.min(W - 26, medianX));

  return (
    <div ref={wrapRef}>
      <ChartFrame
        width={W}
        height={H}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        ariaLabel={`The Court in ${termLabel(term)} on a liberal to conservative axis: one dot per justice`}
        svgProps={{ style: { height: H } }}
      >
        {() => (
          <>
            <line
              x1={padX}
              x2={W - padX}
              y1={axisY}
              y2={axisY}
              stroke="var(--line-strong)"
              strokeWidth={1.5}
            />
            <text x={padX} y={H - 6} fill="var(--ink-muted)" fontSize={12}>
              More liberal
            </text>
            <text
              x={W - padX}
              y={H - 6}
              fill="var(--ink-muted)"
              fontSize={12}
              textAnchor="end"
            >
              More conservative
            </text>

            <line
              x1={medianX}
              x2={medianX}
              y1={20}
              y2={H - 30}
              stroke="var(--ink)"
              strokeDasharray="3 3"
              strokeWidth={1}
              opacity={0.55}
            />
            <text
              x={mClamped}
              y={12}
              textAnchor="middle"
              fill="var(--ink)"
              fontSize={12}
              fontWeight={600}
            >
              Median
            </text>

            {/* Labels and leaders first, so dots draw over them. */}
            <g>
              {layout.dots.map((d) => {
                const j = byId.get(d.id) as CourtJustice;
                const l = labelFor.get(d.id);
                if (!l) return null;
                const dim = isDimmed(j, filter);
                const sel = selectedId === j.id;
                let leader: React.ReactNode = null;
                if (l.ring > 0) {
                  const ex = Math.max(l.box.x0, Math.min(l.box.x1, d.cx));
                  const ey = Math.max(l.box.y0, Math.min(l.box.y1, d.cy));
                  const dx = ex - d.cx;
                  const dy = ey - d.cy;
                  const len = Math.hypot(dx, dy) || 1;
                  leader = (
                    <line
                      x1={d.cx + (dx / len) * (dotR + 1)}
                      y1={d.cy + (dy / len) * (dotR + 1)}
                      x2={ex}
                      y2={ey}
                      stroke="var(--line-strong)"
                      strokeWidth={1}
                    />
                  );
                }
                return (
                  <g
                    key={j.id}
                    opacity={dim ? 0.22 : 1}
                    style={{ cursor: "pointer" }}
                    onPointerEnter={(e) => showTip(j.id, e)}
                    onPointerMove={tip.move}
                    onPointerLeave={tip.hide}
                    onClick={() => onSelect(j.id)}
                  >
                    {leader}
                    <text
                      x={l.tx}
                      y={l.ty}
                      textAnchor={l.anchor}
                      fill="var(--ink)"
                      fontSize={fontSize}
                      fontWeight={sel ? 600 : 400}
                    >
                      {j.short}
                    </text>
                  </g>
                );
              })}
            </g>

            <g>
              {layout.dots.map((d) => {
                const j = byId.get(d.id) as CourtJustice;
                const dim = isDimmed(j, filter);
                const sel = selectedId === j.id;
                const m = mid(j.id);
                return (
                  <g
                    key={j.id}
                    opacity={dim ? 0.22 : 1}
                    style={{ cursor: "pointer" }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${j.name}, score ${fmtScore(scoreAt(j, term))}${m ? (m === "left" ? ", left the Court mid-term" : ", joined the Court mid-term") : ""}`}
                    aria-pressed={sel}
                    onPointerEnter={(e) => showTip(j.id, e)}
                    onPointerMove={tip.move}
                    onPointerLeave={tip.hide}
                    onClick={() => onSelect(j.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(j.id);
                      }
                    }}
                    className="court-dot"
                  >
                    {sel && (
                      <circle
                        cx={d.cx}
                        cy={d.cy}
                        r={dotR + 5}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={2.5}
                      />
                    )}
                    <circle
                      cx={d.cx}
                      cy={d.cy}
                      r={dotR}
                      fill={m ? "var(--surface)" : partyVar(j)}
                      stroke={m ? partyVar(j) : "var(--surface)"}
                      strokeWidth={m ? 2.5 : 1.5}
                    />
                  </g>
                );
              })}
            </g>
          </>
        )}
      </ChartFrame>
      <Tooltip state={tip.state}>
        {(t) => (
          <>
            <b>{t.j.name}</b>
            <div>
              Appointed by {t.j.pres} ({partyLabel(t.j.party)})
            </div>
            <div className="tt-mono">
              Score {termLabel(term)}: {fmtScore(t.score)}
            </div>
            {t.median != null && (
              <div>
                Most likely median justice ({Math.round(t.median * 100)}%)
              </div>
            )}
            {t.mid && (
              <div>
                {t.mid === "left"
                  ? "Left the Court mid-term"
                  : "Joined the Court mid-term"}
              </div>
            )}
          </>
        )}
      </Tooltip>
    </div>
  );
}

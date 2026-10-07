"use client";

import { useMemo, type MouseEvent } from "react";
import { clusterSites } from "@/lib/bases-derive";
import { SITE_LABEL, SITE_ORDER, type BaseCluster, type BasesPayload } from "@/lib/bases-types";

/** Dot radius at full view, in map units; it shrinks with the square root of the zoom like the host markers. */
export const BASE_R = 2.6;
/** Two dots closer than this many radii merge into one group. */
const MERGE_RADII = 2.2;

const INK = "var(--ink)";
const SURFACE = "var(--surface)";

/**
 * One mark per site type, so colour is never the only cue: major base = filled circle, small site = open ring,
 * host-nation U.S.-funded base = diamond. Same shape in the legend (`BaseGlyph`).
 */
export function BaseGlyph({ t, r, cx = 0, cy = 0 }: { t: number; r: number; cx?: number; cy?: number }) {
  if (t === 1) return <circle cx={cx} cy={cy} r={r} fill={SURFACE} stroke={INK} strokeWidth={r * 0.5} />;
  if (t === 2) return <rect x={cx - r * 0.9} y={cy - r * 0.9} width={r * 1.8} height={r * 1.8} transform={`rotate(45 ${cx} ${cy})`} fill={INK} stroke={SURFACE} strokeWidth={r * 0.25} />;
  return <circle cx={cx} cy={cy} r={r} fill={INK} stroke={SURFACE} strokeWidth={r * 0.25} />;
}

/**
 * The known-installations layer inside the troop map's SVG. Constant-size dots (they carry no headcount) merge
 * within a country when they overlap and split as the map zooms. A Country filter dims the others, never removes them.
 */
export function BasesLayer({
  bases,
  k,
  selIso,
  onPin,
}: {
  bases: BasesPayload;
  k: number;
  selIso: string | null;
  onPin: (e: MouseEvent<SVGGElement>, c: BaseCluster) => void;
}) {
  const r = BASE_R / Math.sqrt(k);
  const clusters = useMemo(() => clusterSites(bases, MERGE_RADII * r), [bases, r]);
  const ordered = selIso ? [...clusters.filter((c) => c.iso3 !== selIso), ...clusters.filter((c) => c.iso3 === selIso)] : clusters;
  return (
    <g data-bases>
      {ordered.map((c) => {
        const dim = selIso !== null && c.iso3 !== selIso;
        const one = c.members.length === 1;
        const t = one ? bases.sites[c.members[0]].t : 0;
        const rc = r * (one ? 1 : 1.55);
        return (
          <g key={c.members[0]} className="dot" opacity={dim ? 0.22 : 1} style={{ cursor: "pointer", transition: "opacity .12s" }} onClick={(e) => onPin(e, c)}>
            {one ? (
              <BaseGlyph t={t} r={rc} cx={c.x} cy={c.y} />
            ) : (
              <>
                <circle cx={c.x} cy={c.y} r={rc} fill={INK} stroke={SURFACE} strokeWidth={r * 0.3} />
                <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="central" fontSize={rc * 1.15} fontWeight={700} fill={SURFACE} style={{ pointerEvents: "none" }}>
                  {c.members.length}
                </text>
              </>
            )}
            {/* A larger invisible target so a fingertip can hit a 2-3px dot. */}
            <circle cx={c.x} cy={c.y} r={Math.max(rc, 6 / Math.sqrt(k))} fill="transparent" />
          </g>
        );
      })}
    </g>
  );
}

export const siteLegend = SITE_ORDER.map((id, t) => ({ id, t, label: SITE_LABEL[id] }));

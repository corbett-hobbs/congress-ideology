"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useElementWidth } from "@/lib/use-element-width";

export interface BandTerm {
  id: string;
  /** Full tooltip / screen-reader name, e.g. "Barack Obama (2009–2017)". */
  label: string;
  /** Last name, shown when it fits; a four-letter form is tried next. */
  last: string;
  party: "D" | "R";
  /** First and last index the term covers on the slider's axis (inclusive). */
  from: number;
  to: number;
}

/**
 * The presidential-term band under a `RangeSelector` track (its `below` slot). Each segment is the same light party
 * tint as the chart bands (rule 10b). Tap a term to snap the window to it (tap the lone selected term again to go back
 * to everything); press on one term and drag across others to select the run; from the keyboard, Enter or Space snaps
 * and Shift+Enter or Shift+Space extends the window to include the term. Terms the window doesn't touch fade.
 */
export function TermBand({
  terms,
  min,
  max,
  value,
  onChange,
}: {
  terms: readonly BandTerm[];
  min: number;
  max: number;
  value: readonly [number, number];
  onChange: (next: [number, number]) => void;
}) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const span = Math.max(1, max - min);
  // Segments run edge to edge between the handles' travel: a year owns half a step either side of its handle position.
  const pct = (i: number) => Math.min(100, Math.max(0, ((i - min) / span) * 100));
  const edge = (t: BandTerm) => [pct(t.from - 0.5), pct(t.to + 0.5)] as const;
  const innerW = Math.max(0, width - 22);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const dragRef = useRef<{ a: number; b: number } | null>(null);

  const full = value[0] === min && value[1] === max;
  const snap = (a: number, b: number) => {
    const from = Math.min(terms[a].from, terms[b].from);
    const to = Math.max(terms[a].to, terms[b].to);
    // Tapping the only selected term again clears the filter.
    onChange(a === b && value[0] === from && value[1] === to ? [min, max] : [from, to]);
  };
  const termAt = (clientX: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box || terms.length === 0) return 0;
    const f = ((clientX - box.left - 11) / Math.max(1, box.width - 22)) * 100;
    let best = 0;
    for (let k = 0; k < terms.length; k++) {
      const [l, r] = edge(terms[k]);
      if (f >= l) best = k;
      if (f >= l && f <= r) return k;
    }
    return best;
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const k = termAt(e.clientX);
    dragRef.current = { a: k, b: k };
    setDrag({ a: k, b: k });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const k = termAt(e.clientX);
    if (k !== dragRef.current.b) {
      dragRef.current = { a: dragRef.current.a, b: k };
      setDrag(dragRef.current);
    }
  };
  const up = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (d) snap(d.a, d.b);
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>, k: number) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (e.shiftKey) {
      const from = Math.min(value[0], terms[k].from);
      const to = Math.max(value[1], terms[k].to);
      onChange([from, to]);
    } else snap(k, k);
  };

  const lo = drag ? Math.min(drag.a, drag.b) : -1;
  const hi = drag ? Math.max(drag.a, drag.b) : -1;

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label="Presidential terms: choose one, or drag across several"
      className="relative mt-0.5 h-[1.45rem] touch-none select-none"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="absolute inset-x-[11px] inset-y-0">
        {terms.map((t, k) => {
          const [l, r] = edge(t);
          const w = ((r - l) / 100) * innerW;
          const c = t.party === "R" ? "--rep" : "--dem";
          const inWin = t.to >= value[0] && t.from <= value[1];
          const picked = drag ? k >= lo && k <= hi : inWin && !full;
          const text = [t.last, `${t.last.slice(0, 4)}.`].find((x) => x.length * 6.2 + 4 <= w) ?? "";
          return (
            <button
              key={t.id}
              type="button"
              title={t.label}
              aria-label={t.label}
              aria-pressed={t.from >= value[0] && t.to <= value[1] && !full}
              onKeyDown={(e) => key(e, k)}
              onClick={(e) => e.preventDefault()}
              className="absolute inset-y-0 cursor-pointer overflow-hidden rounded-[2px] p-0 text-left focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              style={{
                left: `${l}%`,
                width: `calc(${r - l}% - 1px)`,
                background: `color-mix(in oklab, var(${c}) ${picked ? 34 : 20}%, var(--surface))`,
                borderTop: `2.5px solid var(${c})`,
                opacity: full || inWin || drag ? 1 : 0.4,
              }}
            >
              <span aria-hidden className="block px-[3px] pt-px text-[0.62rem] leading-[1.1] text-ink">
                {text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Names for the readout: only when the window is exactly whole terms (first handle on a term's first year, last on a
 * term's last), never for the full range or a hand-dragged window that would claim part of a term it only half covers.
 * One or two terms list their names; three or more give "first – last" (the window is always a continuous run, so the dash means everything between).
 */
export function windowNames(terms: readonly BandTerm[], value: readonly [number, number], min: number, max: number, name: (t: BandTerm) => string): string | undefined {
  if (value[0] === min && value[1] === max) return undefined;
  if (!terms.some((t) => t.from === value[0]) || !terms.some((t) => t.to === value[1])) return undefined;
  const inside = terms.filter((t) => t.from >= value[0] && t.to <= value[1]);
  if (inside.length === 0) return undefined;
  const n = inside.map(name);
  return n.length <= 2 ? n.join(", ") : `${n[0]} – ${n[n.length - 1]}`;
}

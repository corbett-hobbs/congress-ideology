"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useElementWidth } from "@/lib/use-element-width";

export interface BandTerm {
  id: string;
  /** Full tooltip / screen-reader name, e.g. "Barack Obama (2009–2017)". */
  label: string;
  /** Last name, shown when it fits; a four-letter form is tried next. */
  last: string;
  /** Initials, e.g. "BO", used when the last name and its four-letter form don't fit the segment. */
  initials: string;
  party: "D" | "R";
  /** First and last index the term covers on the slider's axis (inclusive). */
  from: number;
  to: number;
}

/**
 * The presidential-term band under a `RangeSelector` track (its `below` slot). Each segment is the same light party
 * tint as the chart bands (rule 10b), labelled with the last name, else a four-letter form, else initials, else the last
 * initial. Terms *add up*: tapping an unselected term adds it to the window (including any terms between, since the
 * window is one continuous run); tapping a selected term at either end of the run drops it, and tapping the only
 * selected term clears the filter. A selected term in the middle can't be dropped without leaving a gap, so it does
 * nothing. Press on one term and drag across others to add the whole run; Enter or Space toggles from the keyboard.
 * Terms the window doesn't touch fade.
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
  // Where a term's last year is also the next term's first (an inauguration year on a calendar-year axis), the two meet
  // at that year's centre instead of overlapping by a step.
  const edge = (t: BandTerm) => {
    const k = terms.indexOf(t);
    const sharesStart = k > 0 && terms[k - 1].to === t.from;
    const sharesEnd = k < terms.length - 1 && terms[k + 1].from === t.to;
    return [pct(sharesStart ? t.from : t.from - 0.5), pct(sharesEnd ? t.to : t.to + 0.5)] as const;
  };
  const innerW = Math.max(0, width - 22);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const dragRef = useRef<{ a: number; b: number } | null>(null);

  const full = value[0] === min && value[1] === max;
  // Terms the window covers whole; none while it is the full range (nothing is "selected" then).
  const selected = full ? [] : terms.map((t, k) => (t.from >= value[0] && t.to <= value[1] ? k : -1)).filter((k) => k >= 0);
  const addRun = (a: number, b: number) => {
    const lo = Math.min(terms[a].from, terms[b].from);
    const hi = Math.max(terms[a].to, terms[b].to);
    onChange(full ? [lo, hi] : [Math.min(lo, value[0]), Math.max(hi, value[1])]);
  };
  const toggle = (k: number) => {
    if (!selected.includes(k)) return addRun(k, k);
    if (selected.length === 1) return onChange([min, max]);
    if (k === selected[0]) onChange([terms[selected[1]].from, value[1]]);
    else if (k === selected[selected.length - 1]) onChange([value[0], terms[selected[selected.length - 2]].to]);
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
    if (!d) return;
    if (d.a === d.b) toggle(d.a);
    else addRun(Math.min(d.a, d.b), Math.max(d.a, d.b));
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>, k: number) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    toggle(k);
  };

  const lo = drag ? Math.min(drag.a, drag.b) : -1;
  const hi = drag ? Math.max(drag.a, drag.b) : -1;

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label="Presidential terms: tap to add or remove, or drag across several"
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
          const picked = (drag ? k >= lo && k <= hi : false) || selected.includes(k);
          const text = [t.last, `${t.last.slice(0, 4)}.`, t.initials, t.initials.slice(-1)].find((x) => x.length * 6.2 + (x.length > 1 ? 4 : 1) <= w) ?? "";
          return (
            <button
              key={t.id}
              type="button"
              title={t.label}
              aria-label={t.label}
              aria-pressed={selected.includes(k)}
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
              <span aria-hidden className="block px-px pt-px text-center text-[0.62rem] leading-[1.1] text-ink">
                {text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


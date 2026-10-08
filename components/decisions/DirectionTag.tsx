"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { DIRECTION_LABEL, directionNote } from "@/lib/decisions-direction";
import type { DecisionDirection } from "@/lib/decisions-types";

const TONE: Record<DecisionDirection, string> = {
  1: "bg-[var(--outcome-con-bg)] text-[var(--outcome-con-ink)]",
  2: "bg-[var(--outcome-lib-bg)] text-[var(--outcome-lib-ink)]",
};

/** The dot colour for a direction, shared with the filter pills. */
export const DIRECTION_DOT: Record<DecisionDirection, string> = { 1: "var(--outcome-con)", 2: "var(--outcome-lib)" };

const MARGIN = 8;

/**
 * "Liberal" / "Conservative" beside a case's name: the Supreme Court Database's coding of who prevailed. It is small on purpose
 * (the size of the Landmark badge); what it means for the case's issue area is in a note that opens on hover, on keyboard focus,
 * or on a tap (a second tap, a tap elsewhere, Escape or scrolling closes it). The note is `position: fixed`, so the list's scroll
 * box never clips it.
 */
export function DirectionTag({ direction, areaId }: { direction: DecisionDirection; areaId: string | null }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const id = useId();
  /** How the last press arrived. A mouse has already opened the note by hovering; a touch is only the click, so it toggles. */
  const pointer = useRef<string>("");
  const label = DIRECTION_LABEL[direction];
  const note = directionNote(direction, areaId);

  useLayoutEffect(() => {
    if (!open || !btn.current || !tip.current) return;
    const b = btn.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(b.left, window.innerWidth - t.width - MARGIN));
    const below = b.bottom + 6;
    const top = below + t.height > window.innerHeight - MARGIN && b.top - 6 - t.height > MARGIN ? b.top - 6 - t.height : below;
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const outside = (e: PointerEvent) => {
      if (!btn.current?.contains(e.target as Node)) close();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const show = () => setOpen(true);
  const hide = () => {
    setOpen(false);
    setPos(null);
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onPointerDown={(e) => (pointer.current = e.pointerType)}
        onPointerEnter={(e) => e.pointerType === "mouse" && show()}
        onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && show()}
        onBlur={hide}
        onClick={() => {
          const mouse = pointer.current === "mouse";
          pointer.current = "";
          if (mouse) show();
          else if (open) hide();
          else show();
        }}
        className={`ml-2 inline-block cursor-help whitespace-nowrap rounded-full border-0 px-1.5 py-px align-baseline font-[inherit] text-[0.66rem] font-medium leading-[1.35] ${TONE[direction]} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
      >
        {label}
        <span className="sr-only"> outcome</span>
      </button>
      {open && (
        <span
          ref={tip}
          id={id}
          role="tooltip"
          style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, maxWidth: `min(19rem, calc(100vw - ${MARGIN * 2}px))` }}
          className="pointer-events-none z-50 block rounded-md border border-line-strong bg-surface-raised px-2.5 py-2 text-[0.75rem] font-normal leading-snug text-ink shadow-lg"
        >
          {note}
        </span>
      )}
    </>
  );
}

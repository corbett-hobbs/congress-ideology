"use client";

import { useEffect, useId, useRef, useState } from "react";
import { dim2Context } from "@/lib/dim2-context";

/**
 * The "i" marker beside the compass's vertical-axis label. On a mouse it opens
 * a popover on hover; on touch / keyboard it toggles on click. The popover
 * carries the era-appropriate note on what dimension 2 measures for the
 * Congress shown, plus its source link — the content that used to sit in a
 * permanent footnote below the chart (removed).
 *
 * Shared by the explorer compass and the profile-page compass (both via
 * CompassPanel), so the wording stays identical on both. See lib/dim2-context.ts.
 */
export function Dim2Note({ congress }: { congress: number }) {
  const ctx = dim2Context(congress);
  const [open, setOpen] = useState(false);
  // Mouse -> open on hover; touch / keyboard -> toggle on click. Evaluated
  // lazily on the client; only affects which handlers bind, not the markup.
  const [hoverCapable] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const hover = hoverCapable
    ? { onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false) }
    : {};

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex [writing-mode:horizontal-tb]"
      {...hover}
    >
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-label="What dimension 2 measures"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-[13px] cursor-help items-center justify-center rounded-full border border-ink-faint font-mono text-[0.55rem] leading-none text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        i
      </button>

      {open && (
        <span
          role="dialog"
          aria-labelledby={labelId}
          className="absolute left-0 top-[calc(100%+6px)] z-40 block w-[min(19rem,calc(100vw-2.5rem))] rounded-lg border border-line bg-surface p-3 text-left shadow-[0_10px_26px_rgba(10,12,16,0.16)]"
        >
          <span
            id={labelId}
            className="mb-1 block font-mono text-[0.62rem] uppercase tracking-[0.06em] text-accent"
          >
            {ctx.tag}
          </span>
          <span className="block text-[0.78rem] leading-[1.55] text-ink">
            {ctx.body}
          </span>
          <span className="mt-1.5 block text-[0.72rem] text-ink-muted">
            Source:{" "}
            <a
              href={ctx.sourceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-line-strong underline-offset-2 hover:decoration-accent"
            >
              {ctx.sourceLabel}
            </a>
          </span>
        </span>
      )}
    </span>
  );
}

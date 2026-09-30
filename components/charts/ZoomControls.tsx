"use client";

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  canZoomIn: boolean;
  /** Any zoom applied — enables "out" and "reset". */
  zoomed: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const BTN =
  "flex size-7 items-center justify-center rounded-md border border-line-strong bg-surface-raised/90 font-mono text-[0.95rem] leading-none text-ink-muted backdrop-blur-sm hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-default disabled:opacity-40 disabled:hover:text-ink-muted";

/**
 * Corner buttons for a zoomable chart. Absolutely positioned: render inside a
 * `relative` wrapper around the chart. The keyboard/touch route to zoom, and
 * the only discoverable one — wheel, pinch and double-click are shortcuts.
 */
export function ZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
  canZoomIn,
  zoomed,
  className = "right-1.5 top-1.5",
  style,
}: ZoomControlsProps) {
  return (
    <div
      role="group"
      style={style}
      aria-label="Zoom"
      className={`absolute z-10 flex flex-col gap-1 ${className}`}
    >
      <button
        type="button"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
        title="Zoom in (or double-click, pinch, Ctrl/⌘ + scroll)"
        className={BTN}
      >
        +
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        disabled={!zoomed}
        aria-label="Zoom out"
        title="Zoom out"
        className={BTN}
      >
        −
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={!zoomed}
        aria-label="Reset zoom"
        title="Reset zoom"
        className={BTN}
      >
        ⤢
      </button>
    </div>
  );
}

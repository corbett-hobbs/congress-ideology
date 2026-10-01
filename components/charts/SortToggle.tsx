"use client";

/**
 * Shared sort control for "How each state votes" / "How each committee
 * votes" — three grouped pills, matching the site's existing toggle chrome
 * (chamber switch, Members/Committees, compass mode). "Widest spread" and
 * "A–Z" are pick-one-of-N; "Ideology" is the same button both directions —
 * clicking it again while already active reverses the sort instead of doing
 * nothing. See ARCHITECTURE_MAP.md's shared-primitive table.
 */

export type SortMode = "gap" | "az" | "ideology";
export type SortDirection = "asc" | "desc";

export interface SortState {
  mode: SortMode;
  direction: SortDirection;
}

/** Fresh activation always starts most-conservative-first, regardless of
 *  whatever direction "Ideology" was last left in. */
export const DEFAULT_SORT: SortState = { mode: "gap", direction: "desc" };

const IDEOLOGY_TOOLTIP =
  "Sorts by mean ideology — tap again to reverse direction";

export function SortToggle({
  state,
  onChange,
  ariaLabel,
  spreadLabel = "Widest spread",
}: {
  state: SortState;
  onChange: (next: SortState) => void;
  ariaLabel: string;
  spreadLabel?: string;
}) {
  function select(mode: SortMode) {
    if (mode !== "ideology") {
      onChange({ mode, direction: state.direction });
      return;
    }
    onChange({
      mode: "ideology",
      direction:
        state.mode === "ideology"
          ? state.direction === "desc"
            ? "asc"
            : "desc"
          : "desc",
    });
  }

  const ideologyActive = state.mode === "ideology";

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-none overflow-hidden rounded-lg border border-line-strong text-[0.8rem] font-medium"
    >
      {(
        [
          ["gap", spreadLabel],
          ["az", "A–Z"],
        ] as const
      ).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => select(mode)}
          aria-pressed={state.mode === mode}
          className={`px-2 py-[0.35rem] transition-colors sm:px-[0.85rem] ${
            state.mode === mode
              ? "bg-accent text-accent-ink"
              : "bg-surface-raised text-ink-muted hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => select("ideology")}
        aria-pressed={ideologyActive}
        title={IDEOLOGY_TOOLTIP}
        className={`flex items-center gap-1 px-2 py-[0.35rem] transition-colors sm:px-[0.85rem] ${
          ideologyActive
            ? "bg-accent text-accent-ink"
            : "bg-surface-raised text-ink-muted hover:text-ink"
        }`}
      >
        Ideology
        <span
          aria-hidden
          className={`inline-block text-[0.6rem] leading-none transition-transform ${
            ideologyActive && state.direction === "asc" ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
    </div>
  );
}

/**
 * A pick-one sort control where EVERY button reverses on a second click: the
 * active button carries a ▾ that flips when the order is reversed. Generic over
 * the option keys, so any chart can use it (the trade charts do). Controlled;
 * the page owns `{ key, reversed }` and decides what a click means (typically
 * `nextSort` in lib/trade-derive.ts: same key flips, another key resets).
 * The original `SortToggle` above is unchanged.
 */
export function ReversibleSortToggle<K extends string>({
  options,
  active,
  reversed,
  onSelect,
  ariaLabel,
}: {
  options: readonly { key: K; label: string; /** Shown as the button's title: what the default order is. */ hint?: string }[];
  active: K;
  reversed: boolean;
  onSelect: (key: K) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-none overflow-hidden rounded-lg border border-line-strong text-[0.8rem] font-medium">
      {options.map((o) => {
        const on = o.key === active;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onSelect(o.key)}
            aria-pressed={on}
            title={on ? `${o.hint ? `${o.hint}. ` : ""}Click again to reverse the order` : o.hint}
            className={`flex items-center gap-1 px-2 py-[0.35rem] transition-colors sm:px-[0.85rem] ${
              on ? "bg-accent text-accent-ink" : "bg-surface-raised text-ink-muted hover:text-ink"
            }`}
          >
            {o.label}
            {on && (
              <span aria-hidden className={`inline-block text-[0.6rem] leading-none transition-transform ${reversed ? "rotate-180" : ""}`}>
                ▾
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

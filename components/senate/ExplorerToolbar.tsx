"use client";

import { CHAMBER_VIEWS, viewLabel } from "@/lib/chamber";
import { useExplorerUrl } from "@/lib/use-chamber";
import { StateFilter } from "./StateFilter";
import { ordinal, congressYears } from "./format";

interface ExplorerToolbarProps {
  states: string[];
  congress: number;
  min: number;
  max: number;
  playing: boolean;
  /** The Congress the committee data covers — the toggle is live only here. */
  committeeCongress: number;
  onCongressChange: (c: number) => void;
  onTogglePlay: () => void;
}

const COMMITTEE_LOCK_TITLE =
  "Only available at the 119th Congress — committee membership isn't tracked historically.";
const STATE_LOCK_TITLE = "Committees aren't scoped to a state.";

/**
 * The one sticky toolbar for the explorer: chamber switch, the
 * members/committees toggle, state filter, play/pause, the Congress slider, and
 * the Congress readout.
 *
 * Below `sm` (this component's existing mobile breakpoint — everything else
 * here already keys off it) the state control and the play/slider/readout
 * group collapse into one merged row, the "STATE" label drops (the select's
 * own "All states" placeholder already says what it is), and the Congress
 * readout stacks ("119th" over the year range) to free the horizontal room
 * that merge needs. At `sm` and up all of that reverts to today's single-row
 * layout, unchanged.
 *
 * The joint-committee helper line genuinely diverges by breakpoint: at `sm`+
 * it's always in the DOM with its height reserved (opacity-toggled) so the
 * horizontal controls above it never jump while a person's eye is on them;
 * below `sm` nothing above it moves horizontally when it appears, so it's
 * conditionally rendered instead — the toolbar is simply shorter when it
 * doesn't apply, not showing a reserved gap.
 */
export function ExplorerToolbar({
  states,
  congress,
  min,
  max,
  playing,
  committeeCongress,
  onCongressChange,
  onTogglePlay,
}: ExplorerToolbarProps) {
  const { view, setView, entity, setEntity } = useExplorerUrl();

  const committeesLive = congress === committeeCongress;
  const committeesActive = committeesLive && entity === "committees";
  const showJointHelper = committeesActive && view === "both";

  const jointNoteBody = (
    <>
      <span className="mr-1.5 inline-block size-[0.4rem] rounded-full bg-oth align-middle" />
      Joint committees show only under <b className="font-medium">Both</b> —
      they have no single owning chamber.
    </>
  );

  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 backdrop-blur">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 sm:gap-x-5">
          <div
            role="group"
            aria-label="Chamber"
            className="flex flex-none overflow-hidden rounded-lg border border-line-strong text-[0.8rem] font-medium"
          >
            {CHAMBER_VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`px-2 py-[0.35rem] transition-colors sm:px-[0.85rem] ${
                  view === v
                    ? "bg-accent text-accent-ink"
                    : "bg-surface-raised text-ink-muted hover:text-ink"
                }`}
              >
                {viewLabel(v)}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Show"
            className="flex flex-none overflow-hidden rounded-lg border border-line-strong text-[0.8rem] font-medium"
          >
            {(
              [
                ["members", "Members", false],
                ["committees", "Committees", !committeesLive],
              ] as const
            ).map(([value, label, locked]) => {
              const active = (committeesActive ? "committees" : "members") === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={locked}
                  title={locked ? COMMITTEE_LOCK_TITLE : undefined}
                  onClick={() => setEntity(value)}
                  aria-pressed={active}
                  className={`px-2 py-[0.35rem] transition-colors sm:px-[0.85rem] ${
                    active
                      ? "bg-accent text-accent-ink"
                      : "bg-surface-raised text-ink-muted hover:text-ink"
                  } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-muted`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Below `sm` this is a real flex row, merging the state control into
              the transport group on one line. At `sm`+ it's `display:contents`,
              so its two children fall out as direct children of the row above —
              exactly the original, unwrapped desktop layout. */}
          <div className="flex w-full items-center gap-2 sm:contents">
            <div className="flex flex-none items-center gap-1.5 sm:gap-2">
              <span className="hidden font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint sm:inline">
                State
              </span>
              <StateFilter
                states={states}
                compact
                disabled={committeesActive}
                disabledTitle={STATE_LOCK_TITLE}
              />
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-3 sm:min-w-[220px]">
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={playing ? "Pause" : "Play through every Congress"}
                className="flex size-8 flex-none items-center justify-center rounded-full border border-line-strong bg-surface-raised text-[0.7rem] text-ink transition-colors hover:border-accent"
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <input
                type="range"
                min={min}
                max={max}
                step={1}
                value={congress}
                aria-label="Congress"
                onChange={(e) => onCongressChange(+e.target.value)}
                className="h-6 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
              />
              <div className="flex flex-none flex-col items-end whitespace-nowrap tabular-nums leading-tight sm:flex-row sm:items-baseline sm:gap-1.5 sm:leading-normal">
                <span className="font-mono text-[0.95rem] font-semibold text-ink">
                  {ordinal(congress)}
                </span>
                <span className="text-[0.66rem] text-ink-muted sm:text-[0.76rem]">
                  {congressYears(congress)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile: absent unless both conditions hold — no reserved gap. */}
        {showJointHelper && (
          <p className="pt-1 text-[0.72rem] leading-snug text-ink-muted sm:hidden">
            {jointNoteBody}
          </p>
        )}
        {/* Desktop: always present, opacity-toggled — see the note above. */}
        <p
          aria-hidden={!showJointHelper}
          className={`hidden min-h-[1.3rem] pt-1 text-[0.72rem] leading-snug text-ink-muted transition-opacity sm:block ${
            showJointHelper ? "opacity-100" : "opacity-0"
          }`}
        >
          {jointNoteBody}
        </p>
      </div>
    </div>
  );
}

"use client";

/**
 * A grouped pick-one pill control in the site's existing toggle chrome (same
 * classes as `ChamberSwitch` and `SortToggle`): controlled, no state of its
 * own. Used by the Supreme Court explorer for "Appointed by" and the
 * president-row sort.
 */
export function PillGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  labelledBy,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  labelledBy?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      className="flex flex-none overflow-hidden rounded-lg border border-line-strong text-[0.8rem] font-medium"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`px-2 py-[0.35rem] transition-colors sm:px-[0.85rem] ${
            value === o.value
              ? "bg-accent text-accent-ink"
              : "bg-surface-raised text-ink-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

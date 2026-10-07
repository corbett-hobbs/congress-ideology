import Link from "next/link";
import type { Section } from "@/lib/verticals";

/**
 * A branch's pages as linked rows: title, one-sentence blurb, arrow. Wide
 * cards put the blurb beside the title from `sm` up; `stacked` keeps it under
 * the title at every width (narrow half-width cards).
 */
export function HubSectionList({
  sections,
  stacked = false,
  className = "",
}: {
  sections: readonly Section[];
  stacked?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={`flex flex-col divide-y divide-line border-y border-line ${className}`}
    >
      {sections.map((s) => (
        <li key={s.id}>
          {s.status === "live" ? (
            <Link
              href={s.href}
              className="group flex items-baseline justify-between gap-4 py-3 transition-colors"
            >
              <span
                className={`flex flex-col gap-0.5 ${
                  stacked ? "" : "sm:flex-row sm:items-baseline sm:gap-4"
                }`}
              >
                <span
                  className={`font-serif text-lg font-semibold tracking-tight group-hover:text-accent ${
                    stacked ? "" : "sm:w-44 sm:shrink-0"
                  }`}
                >
                  {s.label}
                </span>
                <span className="text-[0.9rem] leading-snug text-ink-muted">
                  {s.blurb}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="font-mono text-ink-faint transition-colors group-hover:text-accent"
              >
                →
              </span>
            </Link>
          ) : (
            <div
              aria-disabled="true"
              className="flex items-baseline justify-between gap-4 py-3 text-ink-faint"
            >
              <span className="font-serif text-lg font-semibold">
                {s.label}
              </span>
              <span className="font-mono text-[0.68rem] uppercase tracking-[0.08em]">
                Soon
              </span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

import type { ReactNode } from "react";
import { dim2AxisLabels, dim2Context } from "@/lib/dim2-context";

/**
 * The compass with word-based axis labels drawn around it in HTML (the SVG
 * chart itself carries no captions in explorer mode). The vertical axis is
 * era-aware — see lib/dim2-context.ts. Session 10.
 */
export function CompassPanel({
  congress,
  children,
}: {
  congress: number;
  children: ReactNode;
}) {
  const { topEndpoint, bottomEndpoint, middle } = dim2AxisLabels(congress);
  const hint = dim2Context(congress).markerHint;

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex w-5 flex-none flex-col items-center justify-between py-1 text-center">
          <span className="text-[0.6rem] text-ink-faint [writing-mode:vertical-rl]">
            {topEndpoint}
          </span>
          <span className="flex items-center gap-1.5 text-[0.72rem] text-ink-muted [writing-mode:vertical-rl]">
            {middle}
            <span
              title={hint}
              className="inline-flex size-[13px] cursor-help items-center justify-center rounded-full border border-ink-faint font-mono text-[0.55rem] leading-none text-ink-muted [writing-mode:horizontal-tb]"
            >
              i
            </span>
          </span>
          <span className="text-[0.6rem] text-ink-faint [writing-mode:vertical-rl]">
            {bottomEndpoint}
          </span>
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      <div className="mt-1.5">
        <div className="text-center text-[0.72rem] text-ink-muted">
          Economic left–right
        </div>
        <div className="flex justify-between px-0.5 text-[0.6rem] text-ink-faint">
          <span>More liberal</span>
          <span>More conservative</span>
        </div>
      </div>
    </div>
  );
}

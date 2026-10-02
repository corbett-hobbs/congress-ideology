"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Matches Tailwind's `md`: below it a chart's methodology starts collapsed. */
const DESKTOP = "(min-width: 768px)";

// useLayoutEffect warns during SSR; swap in useEffect there (a no-op).
const useIsoLayoutEffect = typeof window === "undefined" ? () => {} : useLayoutEffect;

/**
 * The "See methodology" disclosure under a chart. Open by default on desktop,
 * collapsed on mobile. Server HTML ships `open`; on a narrow viewport it is
 * closed before first paint, and after that the reader's own toggling sticks
 * (the effect runs once, on mount).
 */
export function MethodologyNote({
  children,
  label = "Data notes",
  className = "mt-3",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useIsoLayoutEffect(() => {
    if (ref.current && !window.matchMedia(DESKTOP).matches) ref.current.open = false;
  }, []);
  return (
    <details ref={ref} open className={className}>
      <summary className="cursor-pointer text-[0.75rem] text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        {label}
      </summary>
      <div className="m-0 mt-1.5 text-[0.75rem] leading-[1.45] text-ink-muted [&>p]:m-0 [&>p+p]:mt-2">{children}</div>
    </details>
  );
}

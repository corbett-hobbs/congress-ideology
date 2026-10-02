import type { ReactNode } from "react";

/**
 * The "How to read this" disclosure under a page's intro: collapsed by default, at every width. Put it
 * inside `PageHeader`, after the intro paragraph. Reading guidance and caveats about the numbers go here;
 * the page's "Source: …" line stays separate, open, at the bottom of the page.
 */
export function HowToRead({ children, label = "How to read this" }: { children: ReactNode; label?: string }) {
  return (
    <details className="mt-3 text-[0.92rem] leading-[1.65] text-ink-muted">
      <summary className="cursor-pointer font-medium text-ink">{label}</summary>
      <div className="mt-2 [&>p]:m-0 [&>p+p]:mt-2.5">{children}</div>
    </details>
  );
}

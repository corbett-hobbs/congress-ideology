import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  /** Small kicker above the title, e.g. "Presidency · Immigration". */
  eyebrow?: ReactNode;
  /** Subtitle / intro copy. Pass one node or several paragraphs. */
  children?: ReactNode;
  /** `hero` is the homepage scale; `page` is for explorers and dashboards. */
  size?: "hero" | "page";
}

const TITLE: Record<NonNullable<PageHeaderProps["size"]>, string> = {
  hero: "font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-5xl",
  page: "font-serif text-[clamp(1.7rem,3.6vw,2.35rem)] font-medium leading-[1.1] tracking-[-0.01em]",
};

const BODY: Record<NonNullable<PageHeaderProps["size"]>, string> = {
  hero: "text-[1.05rem] leading-relaxed",
  page: "text-[0.92rem] leading-[1.65]",
};

/**
 * The single title + subtitle block for top-level pages.
 *
 * It deliberately has NO max-width: the title and intro always span the full
 * content column of the page's <main>. Do not add `max-w-*` here or on
 * anything passed in; narrow the text by narrowing <main>, not the header.
 */
export function PageHeader({
  eyebrow,
  title,
  children,
  size = "page",
}: PageHeaderProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      {eyebrow && (
        <div className="font-mono text-[0.68rem] font-medium uppercase tracking-[0.08em] text-accent">{eyebrow}</div>
      )}
      <h1 className={TITLE[size]}>{title}</h1>
      {children && (
        <div
          className={`flex flex-col gap-3 text-ink-muted [&>p]:m-0 ${BODY[size]}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

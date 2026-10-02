import { forwardRef, type CSSProperties, type ReactNode } from "react";

interface ChartCardProps {
  title: ReactNode;
  lede: ReactNode;
  action?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * The explorer's card chrome: serif title with an optional action (search box,
 * sort toggle) on the same row, a lede beneath, then the body. Shared by the
 * Congress explorer (components/senate/SenateExplorer.tsx) and the Supreme
 * Court explorer (components/court/CourtExplorer.tsx).
 */
export const ChartCard = forwardRef<HTMLElement, ChartCardProps>(function ChartCard({
  title,
  lede,
  action,
  className,
  style,
  children,
}, ref) {
  return (
    <section
      ref={ref}
      style={style}
      className={`flex flex-col rounded-[10px] border border-line bg-surface p-[1.35rem_1.35rem_1.1rem] ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-serif text-[1.05rem] font-medium">{title}</h2>
        {action}
      </div>
      <p className="mb-4 mt-1 text-[0.82rem] leading-[1.5] text-ink-muted">
        {lede}
      </p>
      {children}
    </section>
  );
});

import type { ReactNode } from "react";

/**
 * The card chrome shared by every panel on a member profile page — a bordered
 * surface with a small mono label, and an optional control (`action`) on the
 * label row. Reused across profile sections (ideology today; other verticals
 * as they land).
 */
export function ProfilePanel({
  label,
  action,
  children,
  className,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[10px] border border-line bg-surface p-[1.1rem_1.25rem_1.25rem] ${className ?? ""}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">
          {label}
        </p>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The card chrome shared by every panel on a member profile page — a bordered
 * surface with a small mono label. Reused across profile sections (ideology
 * today; other verticals as they land).
 */
export function ProfilePanel({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[10px] border border-line bg-surface p-[1.1rem_1.25rem_1.25rem] ${className ?? ""}`}
    >
      <p className="mb-3 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </p>
      {children}
    </section>
  );
}

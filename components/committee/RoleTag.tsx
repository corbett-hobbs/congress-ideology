import type { MemberCommitteeMembership } from "@/lib/committee-types";

const ROLE_LABEL = {
  chair: "Chair",
  ranking_member: "Ranking Member",
  member: null,
} as const;

/** Chair / Ranking Member pill; nothing for an ordinary member. */
export function RoleTag({ role }: { role: MemberCommitteeMembership["role"] }) {
  const label = ROLE_LABEL[role];
  if (!label) return null;
  return (
    <span
      className={`ml-2 inline-block rounded-full px-[0.5rem] py-[0.1rem] align-middle text-[0.66rem] font-semibold tracking-[0.01em] ${
        role === "chair"
          ? "bg-accent text-accent-ink"
          : "border border-line-strong bg-surface-raised text-ink-muted"
      }`}
    >
      {label}
    </span>
  );
}

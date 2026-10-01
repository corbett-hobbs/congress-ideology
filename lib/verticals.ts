/**
 * Two-tier site structure: branches (Congress, Supreme Court, Presidency) each
 * containing one or more sections (Congress: Ideology, Wealth).
 *
 * `/` is a hub linking to the branches. The persistent header shows the
 * branches as its primary nav and, for a branch with two or more sections, a
 * secondary row of section tabs (see components/SiteHeader.tsx, SiteNav.tsx).
 * A member's profile page still stacks one section per content vertical (see
 * components/profile/MemberProfileView.tsx).
 *
 * To add a branch: append an entry here and build its routes. To publish a
 * branch that is `soon`, flip its `status` to `live` — the hub card and the
 * nav entry follow.
 */
export interface Section {
  id: string;
  label: string;
  href: string;
}

export interface Branch {
  id: string;
  label: string;
  href: string;
  /** `soon`: no page yet — hub shows a non-link card, nav omits the entry. */
  status: "live" | "soon";
  sections: readonly Section[];
  /** Does this pathname belong to the branch? Drives the active underline. */
  owns: (pathname: string) => boolean;
}

export const branches: readonly Branch[] = [
  {
    id: "presidency",
    label: "Presidency",
    href: "/presidency",
    status: "live",
    sections: [
      { id: "executive-orders", label: "Executive orders", href: "/presidency" },
    ],
    owns: (p) => p === "/presidency" || p.startsWith("/presidency/"),
  },
  {
    id: "congress",
    label: "Congress",
    href: "/congress",
    status: "live",
    sections: [
      { id: "ideology", label: "Ideology", href: "/congress" },
      { id: "wealth", label: "Wealth", href: "/congress/wealth" },
    ],
    owns: (p) => p === "/congress" || p.startsWith("/congress/"),
  },
  {
    id: "supreme-court",
    label: "Supreme Court",
    href: "/supreme-court",
    status: "live",
    sections: [{ id: "ideology", label: "Ideology", href: "/supreme-court" }],
    owns: (p) => p === "/supreme-court" || p.startsWith("/supreme-court/"),
  },
];

export function getBranch(id: string): Branch {
  const b = branches.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown branch: ${id}`);
  return b;
}

/** The branch a pathname belongs to (profile pages under /congress/... count). */
export function activeBranch(pathname: string): Branch | undefined {
  return branches.find((b) => b.owns(pathname));
}

/** The section tab that is current within a branch, by longest href match. */
export function activeSection(
  branch: Branch,
  pathname: string,
): Section | undefined {
  return [...branch.sections]
    .sort((a, b) => b.href.length - a.href.length)
    .find((s) =>
      s.href === branch.href
        ? pathname === s.href
        : pathname === s.href || pathname.startsWith(`${s.href}/`),
    );
}

/** Section tabs show only for a live branch with two or more sections, on the
 *  branch's section pages (not on profile pages beneath it). */
export function sectionRow(
  pathname: string,
): { branch: Branch; active: Section } | null {
  const branch = activeBranch(pathname);
  if (!branch || branch.status !== "live" || branch.sections.length < 2)
    return null;
  const active = activeSection(branch, pathname);
  return active ? { branch, active } : null;
}

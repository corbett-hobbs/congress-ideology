/**
 * Two-level site structure: verticals (Congress, Supreme Court, Presidency),
 * each with ordered sections (Congress: Ideology, Wealth). Every section lands
 * at `/<vertical>/<section>`; a bare `/<vertical>` redirects to the vertical's
 * default section.
 *
 * This module is the single source of truth. The header nav, the sub-nav, the
 * hub cards, the redirect list (next.config.ts) and the sitemap all derive
 * from it. To publish a `soon` section: flip its `status` to `live` and add
 * `app/<vertical>/<section>/page.tsx` — nothing else needs editing.
 *
 * Entity profile routes (senators, house members, committees, justices) keep
 * their own URLs under the vertical and are not sections.
 *
 * `soon` sections have no route: they render disabled in the nav and hub, are
 * absent from the sitemap, and a direct request 404s.
 */
export type Status = "live" | "soon";

export interface Section {
  id: string;
  label: string;
  /** `/<vertical>/<section>` */
  href: string;
  status: Status;
}

export interface Branch {
  id: string;
  label: string;
  /** `/<vertical>` — redirects to the default section when the vertical is live. */
  href: string;
  /** Live iff the default section is live. */
  status: Status;
  defaultSection: string;
  sections: readonly Section[];
  /** Does this pathname belong to the vertical? Drives the active highlight. */
  owns: (pathname: string) => boolean;
}

interface SectionDef {
  id: string;
  label: string;
  status: Status;
}

interface BranchDef {
  id: string;
  label: string;
  defaultSection: string;
  sections: readonly SectionDef[];
}

const DEFS: readonly BranchDef[] = [
  {
    id: "presidency",
    label: "Presidency",
    defaultSection: "executive-orders",
    sections: [
      { id: "executive-orders", label: "Executive orders", status: "live" },
      { id: "economy", label: "Economy", status: "live" },
      { id: "trade", label: "Trade", status: "live" },
      { id: "immigration", label: "Immigration", status: "live" },
      { id: "foreign-aid", label: "Foreign aid", status: "live" },
      { id: "national-security", label: "National security", status: "live" },
    ],
  },
  {
    id: "congress",
    label: "Congress",
    defaultSection: "ideology",
    sections: [
      { id: "ideology", label: "Ideology", status: "live" },
      { id: "wealth", label: "Wealth", status: "live" },
    ],
  },
  {
    id: "supreme-court",
    label: "Supreme Court",
    defaultSection: "ideology",
    sections: [{ id: "ideology", label: "Ideology", status: "live" }],
  },
];

function build(def: BranchDef): Branch {
  const href = `/${def.id}`;
  const sections = def.sections.map((s) => ({ ...s, href: `${href}/${s.id}` }));
  const dflt = sections.find((s) => s.id === def.defaultSection);
  return {
    id: def.id,
    label: def.label,
    href,
    status: dflt?.status === "live" ? "live" : "soon",
    defaultSection: def.defaultSection,
    sections,
    owns: (p) => p === href || p.startsWith(`${href}/`),
  };
}

export const branches: readonly Branch[] = DEFS.map(build);

export function getBranch(id: string): Branch {
  const b = branches.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown branch: ${id}`);
  return b;
}

/** The vertical a pathname belongs to (profile pages beneath it count). */
export function activeBranch(pathname: string): Branch | undefined {
  return branches.find((b) => b.owns(pathname));
}

/** The section that is current within a vertical. Profile pages beneath the
 *  vertical (senators, justices, …) match no section. */
export function activeSection(
  branch: Branch,
  pathname: string,
): Section | undefined {
  return branch.sections.find(
    (s) => pathname === s.href || pathname.startsWith(`${s.href}/`),
  );
}

/** The sub-nav: shown under the header for any live vertical, even with a
 *  single section. `active` is undefined on entity profile pages. */
export function sectionRow(
  pathname: string,
): { branch: Branch; active: Section | undefined } | null {
  const branch = activeBranch(pathname);
  if (!branch || branch.status !== "live") return null;
  return { branch, active: activeSection(branch, pathname) };
}

/** Every live section, for the sitemap and the route-consistency test. */
export function liveSections(): Section[] {
  return branches.flatMap((b) => b.sections.filter((s) => s.status === "live"));
}

/** `/<vertical>` → default section, only for live verticals. */
export function verticalRedirects(): { source: string; destination: string }[] {
  return branches
    .filter((b) => b.status === "live")
    .map((b) => ({
      source: b.href,
      destination: `${b.href}/${b.defaultSection}`,
    }));
}

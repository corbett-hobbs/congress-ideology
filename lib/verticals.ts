/**
 * Top-level content verticals — the entries in the persistent site nav.
 *
 * The site began as one vertical (ideology) and is growing others (wealth, and
 * possibly more). Each vertical is an independent section of the site with its
 * own landing route; a member's profile page then stacks one section per
 * vertical (see components/profile/MemberProfileView.tsx).
 *
 * To add a vertical: append an entry here (nav slot + active-state matching),
 * build its landing route, and add its profile section as a sibling in
 * MemberProfileView. Nothing else in the nav/layout scaffolding should need to
 * change.
 */
export interface Vertical {
  /** Stable key, also used as the profile-section id. */
  key: string;
  /** Nav label. */
  label: string;
  /** Landing route. */
  href: string;
  /** True while a route is present but the vertical isn't built out yet. */
  upcoming?: boolean;
  /** Does this pathname belong to the vertical? Drives nav active state. */
  owns: (pathname: string) => boolean;
}

export const verticals: readonly Vertical[] = [
  {
    key: "ideology",
    label: "Ideology",
    href: "/",
    // The explorer at "/" plus every member profile under /congress/*.
    owns: (p) => p === "/" || p.startsWith("/congress"),
  },
  {
    key: "wealth",
    label: "Wealth",
    href: "/wealth",
    upcoming: true,
    owns: (p) => p === "/wealth" || p.startsWith("/wealth/"),
  },
];

export function activeVertical(pathname: string): Vertical | undefined {
  return verticals.find((v) => v.owns(pathname));
}

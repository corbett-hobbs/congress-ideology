import type { ChamberView } from "./chamber";

/** "members" / "senators" / "House members" — the wealth page's own copy for
 *  counts and subtitles, distinct from lib/chamber.ts's `viewNoun` ("member(s)
 *  of Congress" for "both", used for chamber-neutral prose elsewhere). Shared
 *  by the filter bar and the scatter card so the noun never drifts between
 *  the two. */
export function wealthCountNoun(view: ChamberView): string {
  if (view === "senate") return "senators";
  if (view === "house") return "House members";
  return "members";
}

/**
 * What the Supreme Court Database's "liberal" and "conservative" mean for each issue area, for the note on a case's tag.
 * The database codes the *outcome* of a case, not the justices or the reasoning, by a fixed rule per issue area
 * (codebook, "Decision Direction": http://scdb.wustl.edu/documentation.php?var=decisionDirection). These lines are our short
 * paraphrase of that rule, one pair per area id in `pipeline/reference/decision-issue-areas.json`; the codebook is the authority.
 * Wording stays on "a ruling for X": the tag says who prevailed, not that a ruling was right or wrong. The general caveat (it
 * codes who prevailed, not the justices or the reasoning) is said once in the card's header, not in every note.
 */
import type { DecisionDirection } from "./decisions-types";

export const DIRECTION_LABEL: Record<DecisionDirection, string> = { 1: "Conservative", 2: "Liberal" };

/** [liberal, conservative]: the codebook gives the liberal rule and calls conservative its reverse. */
/**
 * The database's rule codes a stronger executive as the liberal side (its New Deal origin), which in some recent cases is the
 * position conservatives take; said in the note of every area whose rule turns on executive power.
 */
const EXECUTIVE_LIBERAL = "The database\u2019s rule treats a stronger executive as the liberal side, which dates from the New Deal; in some recent cases presidential power is the position conservatives take, so read this as who prevailed, not the politics of the ruling.";
const EXECUTIVE_CONSERVATIVE = "The database\u2019s rule treats a weaker executive as the conservative side, which dates from the New Deal; in some recent cases limiting presidential power is the position liberals take, so read this as who prevailed, not the politics of the ruling.";

const RULE: Record<string, readonly [string, string]> = {
  "criminal-procedure": ["A ruling for the person accused or convicted of a crime.", "A ruling for the government against the person accused or convicted of a crime."],
  "civil-rights": [
    "A ruling for the person claiming a civil right or liberty, including for affirmative action, children, the indigent and Native Americans.",
    "A ruling against the person claiming a civil right or liberty, including against affirmative action.",
  ],
  "first-amendment": [
    "A ruling for the person claiming a civil liberty, for neutrality in religion cases, or for limits on campaign spending to curb corruption.",
    "A ruling against the person claiming a civil liberty, or against limits on campaign spending.",
  ],
  "due-process": [
    "A ruling against the government, except in property-taking cases, where a ruling for the government and against the owner counts as liberal.",
    "A ruling for the government, except in property-taking cases, where a ruling for the owner counts as conservative.",
  ],
  privacy: [
    "A ruling for the person claiming privacy, for the woman in an abortion case, or for disclosure in a Freedom of Information Act case.",
    "A ruling against the person claiming privacy, against the woman in an abortion case, or against disclosure under the Freedom of Information Act.",
  ],
  attorneys: ["A ruling for the attorney or government official in a case not about liability, or for the underdog.", "A ruling against the attorney or government official in a case not about liability."],
  unions: [
    "A ruling for the union, the worker or the injured person against the employer, except in a union antitrust case, where a ruling for competition counts as liberal.",
    "A ruling for the employer or business against the union or the worker, except in a union antitrust case, where a ruling for the union counts as conservative.",
  ],
  "economic-activity": [
    "A ruling for the government, the consumer, the debtor, the injured person, the small business or the environment, against business.",
    "A ruling for business against the government, the consumer, the debtor, the injured person or environmental protection.",
  ],
  "judicial-power": ["A ruling that exercises judicial power, such as reviewing an agency's action.", "A ruling that limits judicial power, such as declining to review an agency's action."],
  federalism: [`A ruling for federal power over the states, or for the president in a dispute with Congress. ${EXECUTIVE_LIBERAL}`, `A ruling for the states over federal power, or for Congress in a dispute with the president. ${EXECUTIVE_CONSERVATIVE}`],
  "federal-taxation": ["A ruling for the United States.", "A ruling for the taxpayer."],
  miscellaneous: [
    `A ruling for the executive over Congress or the states, or for the courts over legislatures. ${EXECUTIVE_LIBERAL}`,
    `A ruling for Congress or the states over the executive, or for legislatures over the courts. A legislative veto is also coded conservative. ${EXECUTIVE_CONSERVATIVE}`,
  ],
};

/** The hover / tap text for a tag: what that side means in the case's issue area. Where there is no rule (no issue area), a plain line. */
export function directionNote(direction: DecisionDirection, areaId: string | null): string {
  const rule = areaId === null ? undefined : RULE[areaId];
  if (!rule) return `${DIRECTION_LABEL[direction]}, in the Supreme Court Database's coding of who prevailed.`;
  return rule[direction === 2 ? 0 : 1];
}

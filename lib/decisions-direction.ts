/**
 * What the Supreme Court Database's "liberal" and "conservative" mean for each issue area, for the tag on a case in the list.
 * The database codes the *outcome* of a case, not the justices or the reasoning, by a fixed rule per issue area
 * (codebook, "Decision Direction": http://scdb.wustl.edu/documentation.php?var=decisionDirection). These lines are our short
 * paraphrase of that rule, one per area id in `pipeline/reference/decision-issue-areas.json`; the codebook is the authority.
 * Wording stays on "ruling for X": the tag says who prevailed, not that a ruling was right or wrong.
 */
import type { DecisionDirection } from "./decisions-types";

export const DIRECTION_LABEL: Record<DecisionDirection, string> = { 1: "Conservative", 2: "Liberal" };

/** The rule for each issue area: what a liberal ruling is, and the conservative one is the reverse unless it says otherwise. */
const LIBERAL_RULE: Record<string, string> = {
  "criminal-procedure": "a ruling for the person accused or convicted of a crime",
  "civil-rights": "a ruling for the person claiming a civil right or liberty, including for affirmative action, children, the indigent and Native Americans",
  "first-amendment": "a ruling for the person claiming a civil liberty, for neutrality in religion cases, or for limits on campaign spending to curb corruption",
  "due-process": "a ruling against the government (but in a property-taking case, a ruling for the government and against the owner)",
  privacy: "a ruling for the person claiming privacy, for the woman in an abortion case, or for disclosure in a Freedom of Information Act case",
  attorneys: "a ruling for the attorney or government official in a non-liability case, or for the underdog",
  unions: "a ruling for the union, the worker or the injured person against the employer (but in a union antitrust case, for competition)",
  "economic-activity": "a ruling for the government, the consumer, the debtor, the injured person, the small business or the environment, against business",
  "judicial-power": "a ruling that uses judicial power, such as reviewing an agency's action",
  federalism: "a ruling for federal power over the states, or for the president in a dispute with Congress",
  "federal-taxation": "a ruling for the United States, not the taxpayer",
  miscellaneous: "a ruling for the executive over Congress or the states, or for the courts over legislatures",
};

/**
 * The hover / tap text for a tag: "Liberal here means a ruling for X; conservative is the reverse." Falls back to the general
 * line where a case has a direction but no issue area, or an area we have no rule for.
 */
export function directionNote(direction: DecisionDirection, areaId: string | null): string {
  const rule = areaId === null ? undefined : LIBERAL_RULE[areaId];
  const side = DIRECTION_LABEL[direction];
  const head = `${side} outcome.`;
  const tail = "The Supreme Court Database codes who prevailed by a fixed rule for each issue area. It is not a rating of the justices or the reasoning.";
  if (!rule) return `${head} ${tail}`;
  const pair = direction === 2 ? `Here, liberal means ${rule}.` : `Here, liberal means ${rule}; conservative is the reverse.`;
  return `${head} ${pair} ${tail}`;
}

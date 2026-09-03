/**
 * What DW-NOMINATE's second dimension represents shifts over time, so the
 * compass view footnotes it based on the Congress currently shown.
 *
 * ── Where the threshold comes from ──────────────────────────────────────────
 * Computed from pipeline/output/ideology_scores.json: the within-party standard
 * deviation of `nokken_poole_dim2` (Democrats and Republicans pooled, House +
 * Senate, ≥10 votes, origin sentinel dropped) per Congress.
 *
 * It does NOT widen in the modern era — it steadily *compresses*: ~0.49 in the
 * 90th Congress (1967) → ~0.42 by the 103rd → ~0.36 by the 105th → ~0.31 from
 * the 112th on. The clearest structural break is the 112th Congress (2011):
 * the bloc of deeply-off-main-axis Republicans (dim2 < −0.5) collapses there —
 * ~13% of House Republicans in the 106th, ~8% in the 108th, ~5% from the 112th
 * onward — and never returns, and the 10th-percentile Republican dim2 rises
 * from ≈ −0.58 (106th) to ≈ −0.39 and holds. That coincides with the 2010 Tea
 * Party wave (the Freedom Caucus itself formed in the 114th). So dimension 2
 * stops carrying a large cross-cutting issue split and becomes a narrow
 * residual that, for the members still off-axis, tracks distance from party
 * leadership — which is the reading the 112th-onward copy below describes.
 *
 * The transition is gradual, not a knife-edge; 112 is the single best cut.
 */
export const DIM2_MODERN_ERA_FROM = 112;

export interface Dim2Context {
  /** Short mono eyebrow, e.g. "DIMENSION 2 · HISTORICAL". */
  tag: string;
  /** The methodological note shown in the axis-label info popover. */
  body: string;
  sourceLabel: string;
  sourceHref: string;
}

const HISTORICAL: Dim2Context = {
  tag: "DIMENSION 2 · HISTORICAL",
  body: "For most of American history, dimension 2 captured differences within the major parties over issues like slavery, currency, nativism, civil rights, and lifestyle issues — cross-cutting splits that didn't track the main left-right axis.",
  sourceLabel: "Voteview, “About us”",
  sourceHref: "https://voteview.com/about",
};

const MODERN: Dim2Context = {
  tag: "DIMENSION 2 · CURRENT ERA",
  body: "In recent Congresses, dimension 2 reads mainly as an establishment vs. anti-establishment split within a party, rather than a left-right measure — members with more negative scores have tended to be less aligned with party leadership.",
  sourceLabel: "FiveThirtyEight analysis of DW-NOMINATE scores",
  sourceHref:
    "https://fivethirtyeight.com/features/the-two-cracks-in-the-republican-party",
};

export function dim2Context(congress: number): Dim2Context {
  return congress >= DIM2_MODERN_ERA_FROM ? MODERN : HISTORICAL;
}

/**
 * Labels for the compass's vertical axis. In the current era dimension 2 reads
 * as pro/anti-establishment, so the axis gets endpoint words; historically it
 * meant too many different things to label its ends, so only the middle
 * carries a name.
 *
 * Sign check against ideology_scores.json: positive `nokken_poole_dim2` is the
 * top of the plot and tracks with leadership — e.g. in the 119th, Speaker Mike
 * Johnson sits at +0.39 and Marjorie Taylor Greene at −0.65 — so top = "Pro".
 */
export function dim2AxisLabels(congress: number): {
  topEndpoint: string;
  bottomEndpoint: string;
  middle: string;
} {
  return congress >= DIM2_MODERN_ERA_FROM
    ? { topEndpoint: "Pro", bottomEndpoint: "Anti", middle: "Establishment" }
    : { topEndpoint: "", bottomEndpoint: "", middle: "Dimension 2" };
}

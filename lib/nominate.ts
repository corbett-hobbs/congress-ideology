/**
 * DW-NOMINATE score families.
 *
 * Voteview's `HSall_members.csv` carries two pairs of ideal-point coordinates
 * that must never be conflated (see `docs/DATA_CONVENTIONS.md` §3):
 *
 * - `nominate_dim{1,2}`     — static: one value per legislator's whole career,
 *                             repeated across every Congress they served.
 * - `nokken_poole_dim{1,2}` — per-Congress: recomputed from each Congress's
 *                             votes. Needed for any view of ideological drift.
 */

export type ScoreFamily = "nominate" | "nokken_poole";
export type NominateDim = 1 | 2;

export type NominateColumn = `${ScoreFamily}_dim${NominateDim}`;

export interface NominateMetric {
  family: ScoreFamily;
  dim: NominateDim;
  /** Column in HSall_members.csv; also the `metric` value on an IssueScore row. */
  column: NominateColumn;
  /** `false` for `nominate_*` (career constant), `true` for `nokken_poole_*`. */
  variesByCongress: boolean;
  label: string;
}

const DIM_LABEL: Record<NominateDim, string> = {
  1: "economic / left–right",
  2: "secondary (social / regional)",
};

const FAMILY_LABEL: Record<ScoreFamily, string> = {
  nominate: "career",
  nokken_poole: "per-Congress",
};

export function nominateMetric(
  family: ScoreFamily,
  dim: NominateDim,
): NominateMetric {
  return {
    family,
    dim,
    column: `${family}_dim${dim}`,
    variesByCongress: family === "nokken_poole",
    label: `${FAMILY_LABEL[family]} DW-NOMINATE, dim ${dim} (${DIM_LABEL[dim]})`,
  };
}

/** All four metrics, in a stable order. */
export const NOMINATE_METRICS: readonly NominateMetric[] = (
  ["nominate", "nokken_poole"] as const
).flatMap((family) =>
  ([1, 2] as const).map((dim) => nominateMetric(family, dim)),
);

/** Static career score for a dimension — "where does this person sit overall." */
export function careerMetric(dim: NominateDim): NominateMetric {
  return nominateMetric("nominate", dim);
}

/** Per-Congress score for a dimension — use for drift / animation / trends. */
export function driftMetric(dim: NominateDim): NominateMetric {
  return nominateMetric("nokken_poole", dim);
}

/**
 * Which family a view should read. A view that shows change over time must use
 * the per-Congress family; a single-point "overall position" view uses career.
 */
export function familyForView(view: "overall" | "drift"): ScoreFamily {
  return view === "drift" ? "nokken_poole" : "nominate";
}

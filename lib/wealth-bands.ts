/**
 * EIGA dollar-range band policy for financial disclosure net worth ranges.
 *
 * Mirrors `pipeline/financial_disclosures/bands.py` (the Python-side source
 * of truth used to produce `assets_total` / `liabilities_total` / `net_worth`
 * in `pipeline/output/financial_disclosures.json`). Python and TypeScript
 * can't literally share one module, so this is the TypeScript restatement of
 * the same tiers; `wealth-data.test.ts` cross-checks its output against the
 * pipeline's own `net_worth` field for every usable row as a regression
 * guard against the two drifting apart. See docs/NET_WORTH_METHODOLOGY.md.
 *
 * Unlike `bands.py::value_total` (which folds the open-ended band's floor
 * into a single point-estimate total), this module keeps `lo`/`hi` apart so
 * callers can render a *range*, not just a point.
 */

const COMMON_TIERS: [number, number][] = [
  [15_001, 50_000],
  [50_001, 100_000],
  [100_001, 250_000],
  [250_001, 500_000],
  [500_001, 1_000_000],
  [1_000_001, 5_000_000],
  [5_000_001, 25_000_000],
  [25_000_001, 50_000_000],
];

function label(lo: number, hi: number): string {
  return `$${lo.toLocaleString("en-US")} - $${hi.toLocaleString("en-US")}`;
}

/** Standard EIGA asset tiers, bottom tier starts at $1,001. */
const ASSET_TIERS: [number, number][] = [[1_001, 15_000], ...COMMON_TIERS];
/** Standard EIGA liability tiers, bottom tier starts at $10,001 (liabilities
 *  under $10,000 aren't reportable). */
const LIABILITY_TIERS: [number, number][] = [[10_001, 15_000], ...COMMON_TIERS];

const ZERO_LABELS = new Set([
  "None (or less than $1,001)",
  "--",
  "Unascertainable",
]);

const OPEN_ENDED_TOP = "Over $50,000,000";
const OPEN_ENDED_SPOUSE_ASSET =
  "Over $1,000,000 and held independently by spouse or dependent child";
const OPEN_ENDED_SPOUSE_LIABILITY =
  "Over $1,000,000 (asset held independently by spouse or dependent child)";

export type BandKind = "closed" | "zero" | "open-ended" | "unavailable";

export interface BandBounds {
  kind: BandKind;
  /** Lower bound in dollars. `null` only when `kind === "unavailable"`. */
  lo: number | null;
  /** Upper bound in dollars. `null` for open-ended and unavailable bands. */
  hi: number | null;
}

const ASSET_MAP = new Map<string, BandBounds>([
  ...ASSET_TIERS.map(
    ([lo, hi]): [string, BandBounds] => [
      label(lo, hi),
      { kind: "closed", lo, hi },
    ],
  ),
  [OPEN_ENDED_TOP, { kind: "open-ended", lo: 50_000_001, hi: null }],
  [OPEN_ENDED_SPOUSE_ASSET, { kind: "open-ended", lo: 1_000_001, hi: null }],
]);

const LIABILITY_MAP = new Map<string, BandBounds>([
  ...LIABILITY_TIERS.map(
    ([lo, hi]): [string, BandBounds] => [
      label(lo, hi),
      { kind: "closed", lo, hi },
    ],
  ),
  [OPEN_ENDED_TOP, { kind: "open-ended", lo: 50_000_001, hi: null }],
  [
    OPEN_ENDED_SPOUSE_LIABILITY,
    { kind: "open-ended", lo: 1_000_001, hi: null },
  ],
]);

function bandBounds(labelText: string, map: Map<string, BandBounds>): BandBounds {
  if (ZERO_LABELS.has(labelText)) return { kind: "zero", lo: 0, hi: 0 };
  const known = map.get(labelText);
  if (known) return known;
  return { kind: "unavailable", lo: null, hi: null };
}

export function assetBandBounds(labelText: string): BandBounds {
  return bandBounds(labelText, ASSET_MAP);
}

export function liabilityBandBounds(labelText: string): BandBounds {
  return bandBounds(labelText, LIABILITY_MAP);
}

export interface FilingRange {
  /** `lo = Σ(asset lo) - Σ(liability hi)`. `null` when any band is unavailable. */
  lo: number | null;
  /** `hi = Σ(asset hi) - Σ(liability lo)`. `null` when open-ended or unavailable. */
  hi: number | null;
  /** At least one band (asset or liability) has no upper bound. */
  openEnded: boolean;
  /** At least one band's label isn't recognized — range can't be computed at all. */
  unavailable: boolean;
}

/**
 * Range for one filing from its band-count maps (`asset_band_counts` /
 * `liability_band_counts` in `financial_disclosures.json`).
 *
 * `unavailable` takes priority over `openEnded` in the returned range (both
 * `lo` and `hi` are `null`), but both flags are reported so callers can tell
 * "we don't know the range at all" apart from "we know the floor, not the
 * ceiling."
 */
export function filingRange(
  assetBandCounts: Record<string, number>,
  liabilityBandCounts: Record<string, number>,
): FilingRange {
  let lo = 0;
  let hi = 0;
  let openEnded = false;
  let unavailable = false;

  for (const [labelText, count] of Object.entries(assetBandCounts)) {
    const b = assetBandBounds(labelText);
    if (b.kind === "unavailable") {
      unavailable = true;
      continue;
    }
    lo += b.lo! * count;
    if (b.hi === null) openEnded = true;
    else hi += b.hi * count;
  }

  for (const [labelText, count] of Object.entries(liabilityBandCounts)) {
    const b = liabilityBandBounds(labelText);
    if (b.kind === "unavailable") {
      unavailable = true;
      continue;
    }
    if (b.hi === null) {
      // An open-ended liability caps how low net worth could go, i.e. it
      // caps `hi`. Without a defined liability ceiling we can't bound `hi`
      // either, so treat it as unavailable rather than silently dropping it.
      unavailable = true;
      continue;
    }
    lo -= b.hi * count;
    hi -= b.lo! * count;
  }

  if (unavailable) return { lo: null, hi: null, openEnded, unavailable: true };
  if (openEnded) return { lo, hi: null, openEnded: true, unavailable: false };
  return { lo, hi, openEnded: false, unavailable: false };
}

import type { CommitteeChamber } from "./committee-types";

/**
 * Committee-compass chamber colours — replaces majority-party coloring for
 * committee dots (member dots are unaffected; see lib/party-palette.ts).
 * Two same-named committees (e.g. "Judiciary" exists in both chambers) sit
 * near each other on the "Both" compass and were indistinguishable under the
 * old red/blue majority-party scheme; chamber colour fixes that directly.
 *
 * Joint committees keep the existing neutral `--oth` swatch (no dedicated
 * "joint" token — same call `lib/party-palette.ts` already makes for
 * independents). Validated OKLab / CVD + WCAG-contrast against the existing
 * dem/rep/oth tokens via `validate_palette.js`.
 */
export function chamberFillClass(chamber: CommitteeChamber): string {
  switch (chamber) {
    case "house":
      return "fill-committee-house";
    case "senate":
      return "fill-committee-senate";
    case "joint":
      return "fill-oth";
  }
}

export const CHAMBER_COLOR_META = {
  house: { label: "House committees", token: "--committee-house" },
  senate: { label: "Senate committees", token: "--committee-senate" },
  joint: { label: "Joint committees", token: "--oth" },
} as const satisfies Record<
  CommitteeChamber,
  { label: string; token: string }
>;

export function chamberCssVar(chamber: CommitteeChamber): string {
  return `var(${CHAMBER_COLOR_META[chamber].token})`;
}

/**
 * Compact dollar formatting for the wealth track (hover cards, axis ticks,
 * standout labels, list cells). Pure, no locale surprises: always `$`,
 * always a leading `-` for negatives (never parens), K/M/B suffixes with
 * trailing zeros trimmed (`$1.36M`, not `$1.36000M`; `$512M`, not `$512.00M`).
 */

function trimTrailingZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** `1_360_000 -> "$1.36M"`, `-38_500_000 -> "-$38.5M"`, `950 -> "$950"`. */
export function formatCompactUSD(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= 1e9) return `${sign}$${trimTrailingZeros((abs / 1e9).toFixed(2))}B`;
  if (abs >= 1e6) return `${sign}$${trimTrailingZeros((abs / 1e6).toFixed(2))}M`;
  if (abs >= 1e3) return `${sign}$${trimTrailingZeros((abs / 1e3).toFixed(1))}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

/** Like `formatCompactUSD`, but always signed (`+$57K`, `-$31.5M`) — for
 *  annualized rates and other deltas where the sign is the point. */
export function formatSignedCompactUSD(value: number): string {
  if (value === 0) return "$0";
  const formatted = formatCompactUSD(Math.abs(value));
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

/** An open-ended midpoint carries a trailing `+` ($1.24B+`). */
export function formatOpenEndedUSD(value: number): string {
  return `${formatCompactUSD(value)}+`;
}

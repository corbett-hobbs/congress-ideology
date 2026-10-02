import type { AidTerm } from "@/lib/foreign-aid-types";

/** Last name of the administration assigned to fiscal year `fy`, or null. */
export function administrationForTermLabel(terms: readonly AidTerm[], fy: number): string | null {
  return terms.find((t) => fy >= t.fromFy && fy <= t.toFy)?.last ?? null;
}

import type { CommitteeBillRow } from "@/lib/committee-bills-entities";
import type { StageCounts } from "@/lib/committee-bills-derive";
import { fmtDate } from "@/components/decisions/CaseListCard";

export { fmtDate };

/** "Mar 4, 2026" from `YYYY-MM-DD`; "Not recorded" for a step with no date. */
export const dateOrDash = (iso: string | null | undefined): string => (iso ? fmtDate(iso) : "—");

export const pct = (n: number, total: number): string => (total > 0 ? `${Math.round((n / total) * 100)}%` : "0%");

export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** What a tile or a node reads when the filter narrows to nothing. */
export const emptyCounts = (): StageCounts => ({ stop: [0, 0, 0, 0, 0, 0, 0], reach: [0, 0, 0, 0, 0, 0, 0], discharged: 0 });

export type Row = CommitteeBillRow;

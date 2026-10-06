/**
 * Legend rows are tight on purpose: small type, small gaps, and items that never break internally, so a legend
 * fills as few lines as possible (one where it fits) instead of spreading over two or three. Use these two
 * classes for every chart legend; see ARCHITECTURE_MAP "Page-level layout rules".
 */
export const LEGEND_ROW = "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.7rem] leading-tight text-ink-muted";
export const LEGEND_ITEM = "inline-flex items-center gap-1 whitespace-nowrap";

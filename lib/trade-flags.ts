/**
 * Event-flag placement for the tariff chart. Pure: pixels in, pixels out.
 *
 * Rules:
 * - Flags within `groupPx` of each other become ONE flag (Feb 20 and Feb 24, 2026 are four days
 *   apart); its text uses the most important member, with a date range.
 * - Priority-1 flags are placed first and always shown. Priority-2 flags are placed only if a lane
 *   has room, so a zoomed-in window shows more of them.
 * - Labels run right from the flag line, and flip to run left when they would pass the plot's
 *   right edge. Labels stack in lanes above the plot so they never cross the data line.
 * - A flag dated after the axis ends (events past the last data month) still shows, pinned to the
 *   right edge.
 */
export interface FlagInput {
  id: string;
  /** Axis day of the effective date. */
  day: number;
  /** Chart label, about 50 characters. */
  label: string;
  priority: 1 | 2;
  /** Short date for the label, e.g. "Feb 24, 2026". */
  dateText: string;
}

export interface PlacedFlag {
  ids: string[];
  /** Pixel x of the flag line. */
  x: number;
  /** Lane index, 0 = nearest the plot. */
  lane: number;
  text: string;
  anchor: "start" | "end";
  /** Label extent in pixels. */
  x0: number;
  x1: number;
  priority: 1 | 2;
  /** Dated past the axis end, pinned to the right edge. */
  pastEnd: boolean;
  /** Compact mode: a number instead of a label. */
  number: number | null;
}

export interface PlaceOptions {
  X: (day: number) => number;
  /** Visible window `[start, end)` in axis days, and the axis end (`span`). */
  viewStart: number;
  viewEnd: number;
  span: number;
  plotLeft: number;
  plotRight: number;
  /** Draw labels (false = numbered markers only, for narrow charts). */
  labels: boolean;
  charW?: number;
  groupPx?: number;
  gap?: number;
  /** Lanes available before priority-2 flags are dropped. */
  lanes?: number;
  /** Extra lanes a priority-1 flag may use if the normal ones are full. */
  extraLanes?: number;
}

const MARKER_W = 16;
/** Flags this close in time read as one event. */
const SAME_STORY_DAYS = 7;

/** "Feb 20, 2026" + "Feb 24, 2026" -> "Feb 20–24, 2026"; different months or years keep both ends. */
export function rangeText(a: string, b: string): string {
  const pa = /^([A-Za-z]+) (\d+), (\d{4})$/.exec(a);
  const pb = /^([A-Za-z]+) (\d+), (\d{4})$/.exec(b);
  if (!pa || !pb) return `${a}–${b}`;
  if (pa[1] === pb[1] && pa[3] === pb[3]) return `${pa[1]} ${pa[2]}–${pb[2]}, ${pa[3]}`;
  if (pa[3] === pb[3]) return `${pa[1]} ${pa[2]}–${pb[1]} ${pb[2]}, ${pa[3]}`;
  return `${a}–${b}`;
}

interface Cluster {
  members: FlagInput[];
  x: number;
  pastEnd: boolean;
}

export function placeFlags(flags: readonly FlagInput[], o: PlaceOptions): PlacedFlag[] {
  const charW = o.charW ?? 6.4;
  const groupPx = o.groupPx ?? 6;
  const gap = o.gap ?? 8;
  const lanes = o.lanes ?? 3;
  const maxLane = lanes + (o.extraLanes ?? 2);

  const inView = flags
    .filter((f) => (f.day >= o.viewStart && f.day < o.viewEnd) || (f.day >= o.span && o.viewEnd >= o.span))
    .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));

  const clusters: Cluster[] = [];
  for (const f of inView) {
    const pastEnd = f.day >= o.span;
    const x = pastEnd ? o.plotRight : o.X(f.day);
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(x - last.x) <= groupPx) last.members.push(f);
    else clusters.push({ members: [f], x, pastEnd });
  }

  const priorityOf = (c: Cluster): 1 | 2 => (c.members.some((m) => m.priority === 1) ? 1 : 2);
  const textOf = (c: Cluster) => {
    const lead = [...c.members].sort((a, b) => a.priority - b.priority || a.day - b.day)[0];
    if (c.members.length === 1) return `${lead.dateText} · ${lead.label}`;
    const days = c.members.map((m) => m.day);
    // Events a few days apart are one story ("Feb 20–24"); months apart are just "+N more" behind the lead.
    if (Math.max(...days) - Math.min(...days) <= SAME_STORY_DAYS) {
      return `${rangeText(c.members[0].dateText, c.members[c.members.length - 1].dateText)} · ${lead.label}`;
    }
    return `${lead.dateText} · ${lead.label} (+${c.members.length - 1} more)`;
  };

  // Priority-1 clusters first, then priority-2, each in date order.
  const order = [...clusters.keys()].sort((a, b) => priorityOf(clusters[a]) - priorityOf(clusters[b]) || a - b);
  const taken: { x0: number; x1: number }[][] = Array.from({ length: maxLane }, () => []);
  const placed: PlacedFlag[] = [];
  const fits = (lane: number, x0: number, x1: number) => taken[lane].every((t) => x1 + gap <= t.x0 || x0 >= t.x1 + gap);

  for (const i of order) {
    const c = clusters[i];
    const pri = priorityOf(c);
    const text = o.labels ? textOf(c) : "";
    const w = o.labels ? text.length * charW + 10 : MARKER_W;
    let anchor: "start" | "end" = c.x + w <= o.plotRight ? "start" : "end";
    let x0 = anchor === "start" ? c.x : c.x - w;
    if (x0 < o.plotLeft) {
      anchor = "start";
      x0 = Math.max(o.plotLeft, c.x);
    }
    const x1 = x0 + w;
    const limit = pri === 1 ? maxLane : lanes;
    let lane = -1;
    for (let l = 0; l < limit; l++) {
      if (fits(l, x0, x1)) {
        lane = l;
        break;
      }
    }
    if (lane < 0) continue; // priority-2 with no room
    taken[lane].push({ x0, x1 });
    placed.push({ ids: c.members.map((m) => m.id), x: c.x, lane, text, anchor, x0, x1, priority: pri, pastEnd: c.pastEnd, number: null });
  }
  placed.sort((a, b) => a.x - b.x);
  if (!o.labels) placed.forEach((p, i) => (p.number = i + 1));
  return placed;
}

/** Lanes actually used, so the chart reserves exactly that much height above the plot. */
export const lanesUsed = (placed: readonly PlacedFlag[]) => (placed.length ? Math.max(...placed.map((p) => p.lane)) + 1 : 0);

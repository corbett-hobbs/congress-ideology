import { energyActionsFile, MAX_ENERGY_PRIORITY_1, type EnergyActionsFile } from "../../lib/energy-actions-entities";

export class EnergyActionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnergyActionsError";
  }
}

export interface EnergyValidationContext {
  /** `series_id`s from the energy catalog. */
  seriesIds: ReadonlySet<string>;
  /** `eo_number`s from executive_orders.json. */
  eoNumbers: ReadonlySet<number>;
  /** ISO date; nothing may be dated after it, except an effective date that follows a past announcement. */
  today: string;
}

const real = (iso: string) => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso;
};

/** Parses and cross-checks the curated file; throws `EnergyActionsError` with a specific message on the first problem. */
export function validateEnergyActions(raw: unknown, ctx: EnergyValidationContext): EnergyActionsFile {
  const parsed = energyActionsFile.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new EnergyActionsError(`schema: ${i.path.join(".") || "(root)"}: ${i.message}`);
  }
  const file = parsed.data;
  const fail = (m: string): never => {
    throw new EnergyActionsError(m);
  };
  if (!real(file.last_reviewed)) fail(`last_reviewed ${file.last_reviewed} is not a real date`);
  if (file.last_reviewed > ctx.today) fail(`last_reviewed ${file.last_reviewed} is in the future`);

  const ids = new Set<string>();
  for (const a of file.actions) {
    const at = `action ${a.action_id}`;
    if (ids.has(a.action_id)) fail(`duplicate action_id ${a.action_id}`);
    ids.add(a.action_id);
    if (!a.action_id.startsWith(a.date)) fail(`${at}: action_id must start with its effective date ${a.date}`);
    for (const [k, d] of [["date", a.date], ["announced_date", a.announced_date]] as const) {
      if (d !== undefined && !real(d)) fail(`${at}: ${k} ${d} is not a real date`);
    }
    // Every row is a past event: the announcement (or signing) date may not be in the future.
    if ((a.announced_date ?? a.date) > ctx.today) fail(`${at}: ${a.announced_date ? "announced_date" : "date"} ${a.announced_date ?? a.date} is in the future`);
    if (a.announced_date && a.announced_date > a.date) fail(`${at}: announced_date ${a.announced_date} is after the effective date ${a.date}`);
    if (!a.sources.some((s) => s.kind === "primary")) fail(`${at}: needs at least one primary source`);
    for (const s of a.series) if (!ctx.seriesIds.has(s)) fail(`${at}: series ${s} is not in the energy catalog`);
    for (const n of a.links?.eo_numbers ?? []) if (!ctx.eoNumbers.has(n)) fail(`${at}: eo_number ${n} is not in executive_orders.json`);
    if (a.area === "spr" && !a.series.includes("WCSSTUS1")) fail(`${at}: an SPR action must list WCSSTUS1`);
    if (a.area === "spr" && !a.kind.startsWith("release") && a.kind !== "refill") fail(`${at}: an SPR action needs a release_* or refill kind`);
    if (a.area !== "spr" && (a.kind.startsWith("release") || a.kind === "refill")) fail(`${at}: release_*/refill kinds are for SPR actions only`);
  }
  const p1 = file.actions.filter((a) => a.flag_priority === 1).length;
  if (p1 > MAX_ENERGY_PRIORITY_1) fail(`${p1} priority-1 rows; the cap is ${MAX_ENERGY_PRIORITY_1}`);
  for (let i = 1; i < file.actions.length; i++) {
    const [a, b] = [file.actions[i - 1], file.actions[i]];
    if (a.date > b.date || (a.date === b.date && a.action_id > b.action_id)) fail(`rows are not sorted: ${a.action_id} comes before ${b.action_id}`);
  }
  return file;
}

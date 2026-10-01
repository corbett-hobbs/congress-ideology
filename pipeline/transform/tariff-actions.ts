import { tariffActionsFile, MAX_PRIORITY_1, type TariffAction, type TariffActionsFile } from "../../lib/tariff-actions-entities";

export class TariffActionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TariffActionsError";
  }
}

export interface ValidationContext {
  /** Non-aggregate `country_code`s from countries.json. */
  countryCodes: ReadonlySet<string>;
  /** `eo_number`s from executive_orders.json. */
  eoNumbers: ReadonlySet<number>;
  /** ISO date; nothing may be dated after it. */
  today: string;
}

const real = (iso: string) => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso;
};

/**
 * Parses and cross-checks the curated file; throws `TariffActionsError` with a specific
 * message on the first problem. Returns the rows sorted by date then id.
 */
export function validateTariffActions(raw: unknown, ctx: ValidationContext): TariffActionsFile {
  const parsed = tariffActionsFile.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new TariffActionsError(`schema: ${i.path.join(".") || "(root)"}: ${i.message}`);
  }
  const file = parsed.data;
  const fail = (m: string): never => {
    throw new TariffActionsError(m);
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
      if (d === undefined) continue;
      if (!real(d)) fail(`${at}: ${k} ${d} is not a real date`);
      if (d > ctx.today) fail(`${at}: ${k} ${d} is in the future`);
    }
    if (a.announced_date && a.announced_date > a.date) fail(`${at}: announced_date ${a.announced_date} is after the effective date ${a.date}`);
    if (a.countries !== "all") {
      if (new Set(a.countries).size !== a.countries.length) fail(`${at}: duplicate country_code`);
      for (const c of a.countries) if (!ctx.countryCodes.has(c)) fail(`${at}: country_code ${c} is not a non-aggregate code in countries.json`);
    }
    if (!a.sources.some((s) => s.kind === "primary")) fail(`${at}: needs at least one primary source`);
    if (a.authority === "other" && !a.authority_note) fail(`${at}: authority "other" needs an authority_note naming the statute`);
    for (const n of a.links?.eo_numbers ?? []) if (!ctx.eoNumbers.has(n)) fail(`${at}: eo_number ${n} is not in executive_orders.json`);
    if (a.authority === "court" && !a.court_case) fail(`${at}: a court row needs court_case`);
  }

  const cut = file.actions.filter((a) => a.is_cutover);
  if (cut.length !== 1) fail(`exactly one row must be the cut-over (is_cutover); found ${cut.length}`);
  const p1 = file.actions.filter((a) => a.flag_priority === 1).length;
  if (p1 > MAX_PRIORITY_1) fail(`${p1} priority-1 rows; the cap is ${MAX_PRIORITY_1}`);
  if (cut[0].flag_priority !== 1) fail(`the cut-over row must be priority 1`);

  for (let i = 1; i < file.actions.length; i++) {
    const [a, b] = [file.actions[i - 1], file.actions[i]];
    if (a.date > b.date || (a.date === b.date && a.action_id > b.action_id)) fail(`rows are not sorted: ${a.action_id} comes before ${b.action_id}`);
  }
  return file;
}

export type { TariffAction };

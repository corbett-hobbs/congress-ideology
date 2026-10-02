import { AID_FIRST_FISCAL_YEAR, AidDataError, aidRow, type AidMeta, type AidRow } from "../../lib/foreign-aid-entities";
import { TX_DISBURSEMENTS, TX_OBLIGATIONS, type RawMeta, type RawRow, type RawYear } from "../fetch/foreign-assistance-lib";

/** Reporting lag the source states for its quarterly updates (~45 days after quarter end). */
export const REPORTING_LAG_DAYS = 45;

/** The slice of `countries.json` the crosswalk needs. */
export interface TradeCountry {
  country_code: string;
  name: string;
  is_aggregate: boolean;
}

/**
 * Source entities that need an explicit rule. Everything else is: a source alpha-3 that is also a
 * non-aggregate trade `country_code` maps to itself; anything else is reported as unmapped.
 */
export const CROSSWALK_RULES: readonly { match: { code?: string | null; name?: string }; key: string | null; rule: string }[] = [
  { match: { code: "CS-KM" }, key: "XKX", rule: "ForeignAssistance.gov labels Kosovo CS-KM; the trade pipeline's user-assigned code is XKX." },
  { match: { code: "PSE" }, key: null, rule: "West Bank and Gaza is one aid recipient; trade reports West Bank (XWB) and Gaza (XGZ) separately, so there is no single trade counterpart." },
  { match: { code: null, name: "Czechoslovakia (former)" }, key: "CSK", rule: "Source gives no code; matched by name to the trade pipeline's Czechoslovakia (CSK)." },
];

export interface Recipient {
  recipient_type: AidRow["recipient_type"];
  country_key: string | null;
  recipient_name: string;
}
export interface CrosswalkEntry {
  recipient_name: string;
  source_code: string | null;
  country_key: string | null;
  how: "identity" | "rule" | "unmapped";
  rule: string | null;
}

/** Classify a source recipient and resolve it to a trade `country_key`. */
export function resolveRecipient(code: string | null, name: string, trade: ReadonlyMap<string, TradeCountry>): { recipient: Recipient; entry: CrosswalkEntry } {
  const isGlobal = code === "WLD";
  const isRegional = !isGlobal && / Region$/.test(name);
  if (isGlobal || isRegional) {
    if (code !== null && trade.has(code)) throw new AidDataError(`regional/global source code ${code} (${name}) collides with a trade country_code`);
    return {
      recipient: { recipient_type: isGlobal ? "global" : "regional", country_key: null, recipient_name: name },
      entry: { recipient_name: name, source_code: code, country_key: null, how: "rule", rule: isGlobal ? "Source's World bucket: global programs." : "Multi-country region: not a country." },
    };
  }
  const rule = CROSSWALK_RULES.find((r) => (r.match.code === undefined || r.match.code === code) && (r.match.name === undefined || r.match.name === name));
  if (rule) {
    if (rule.key !== null && !trade.has(rule.key)) throw new AidDataError(`crosswalk rule maps ${name} to ${rule.key}, which is not in countries.json`);
    return { recipient: { recipient_type: "country", country_key: rule.key, recipient_name: name }, entry: { recipient_name: name, source_code: code, country_key: rule.key, how: "rule", rule: rule.rule } };
  }
  if (code !== null && trade.has(code) && !trade.get(code)!.is_aggregate) {
    return { recipient: { recipient_type: "country", country_key: code, recipient_name: name }, entry: { recipient_name: name, source_code: code, country_key: code, how: "identity", rule: null } };
  }
  return { recipient: { recipient_type: "country", country_key: null, recipient_name: name }, entry: { recipient_name: name, source_code: code, country_key: null, how: "unmapped", rule: null } };
}

/** The partial-year rule: a fiscal year is partial until the source has had its reporting lag after the year ended. */
export function isPartialYear(fiscalYear: number, dataThrough: string): boolean {
  const end = Date.UTC(fiscalYear, 8, 30); // Sep 30 of the year the FY is named for
  const through = Date.parse(`${dataThrough}T00:00:00Z`);
  return through < end + REPORTING_LAG_DAYS * 86_400_000;
}

export interface BuildResult {
  rows: AidRow[];
  meta: AidMeta;
  crosswalk: CrosswalkEntry[];
  stats: { negativeDisbursementRows: number; militaryExceedsTotalRows: number; sourceRows: number };
}

interface Cell {
  recipient: Recipient;
  fy: number;
  category: string;
  disb: number | null;
  obl: number | null;
  mil: number;
}

export function buildAid(years: readonly RawYear[], rawMeta: RawMeta, tradeCountries: readonly TradeCountry[]): BuildResult {
  const trade = new Map(tradeCountries.map((c) => [c.country_code, c]));
  const catName = new Map(rawMeta.categories.map((c) => [c.id, c.name]));
  const crosswalk = new Map<string, CrosswalkEntry>();
  const cells = new Map<string, Cell>();
  const nameTypes = new Map<string, Recipient["recipient_type"]>();
  let sourceRows = 0;

  const cell = (fy: number, row: RawRow): Cell => {
    const [code, name, catId] = row;
    const category = catName.get(catId);
    if (!category) throw new AidDataError(`FY${fy}: ${name} has usg_category_id ${catId}, which is not in meta.json's taxonomy`);
    const { recipient, entry } = resolveRecipient(code, name, trade);
    crosswalk.set(`${code ?? ""}|${name}`, entry);
    const seen = nameTypes.get(name);
    if (seen && seen !== recipient.recipient_type) throw new AidDataError(`recipient name ${name} classified as both ${seen} and ${recipient.recipient_type}`);
    nameTypes.set(name, recipient.recipient_type);
    const k = `${recipient.recipient_type}|${name}|${fy}|${category}`;
    let c = cells.get(k);
    if (!c) cells.set(k, (c = { recipient, fy, category, disb: null, obl: null, mil: 0 }));
    return c;
  };

  const years_ = [...years].sort((a, b) => a.fiscal_year - b.fiscal_year);
  for (const y of years_) {
    if (y.fiscal_year < AID_FIRST_FISCAL_YEAR) throw new AidDataError(`fiscal year ${y.fiscal_year} is before the sector-level series starts (${AID_FIRST_FISCAL_YEAR})`);
    for (const r of y.sector_rows) {
      sourceRows++;
      const c = cell(y.fiscal_year, r);
      if (r[4] === TX_DISBURSEMENTS) c.disb = (c.disb ?? 0) + r[5];
      else if (r[4] === TX_OBLIGATIONS) c.obl = (c.obl ?? 0) + r[5];
    }
  }
  // Military subset: must land on a grain the sector file already has (it is a subset of the same money).
  for (const y of years_) {
    for (const r of y.military_rows) {
      if (r[4] !== TX_DISBURSEMENTS) continue; // military obligations are not carried
      const before = cells.size;
      const c = cell(y.fiscal_year, r);
      if (cells.size !== before) throw new AidDataError(`FY${y.fiscal_year}: military disbursements for ${r[1]} / ${c.category} have no matching row in the sector file`);
      c.mil += r[5];
    }
  }

  const rows: AidRow[] = [];
  let negativeDisbursementRows = 0;
  let militaryExceedsTotalRows = 0;
  const order = (a: AidRow, b: AidRow) => a.fiscal_year - b.fiscal_year || a.recipient_type.localeCompare(b.recipient_type) || a.recipient_name.localeCompare(b.recipient_name) || a.sector_category.localeCompare(b.sector_category);
  for (const c of cells.values()) {
    const row = aidRow.parse({
      recipient_type: c.recipient.recipient_type,
      country_key: c.recipient.country_key,
      recipient_name: c.recipient.recipient_name,
      fiscal_year: c.fy,
      sector_category: c.category,
      disbursements_usd: c.disb ?? 0,
      obligations_usd: c.obl,
      military_disbursements_usd: c.mil,
    });
    if (row.disbursements_usd < 0) negativeDisbursementRows++;
    if (row.military_disbursements_usd > row.disbursements_usd && row.military_disbursements_usd > 0) militaryExceedsTotalRows++;
    rows.push(row);
  }
  rows.sort(order);

  const fiscalYears = years_.map((y) => y.fiscal_year);
  const meta: AidMeta = {
    source: "ForeignAssistance.gov",
    measure: "disbursements",
    dollars: "nominal",
    data_through: rawMeta.data_through,
    first_fiscal_year: fiscalYears[0],
    latest_fiscal_year: fiscalYears[fiscalYears.length - 1],
    partial_basis: "calendar_rule",
    partial_rule: `A fiscal year is partial until data_through is at least ${REPORTING_LAG_DAYS} days (the source's stated quarterly reporting lag) after September 30 of that year. The source publishes no per-year completeness flag.`,
    years: fiscalYears.map((fy) => ({ fiscal_year: fy, is_partial: isPartialYear(fy, rawMeta.data_through) })),
    sector_categories: rawMeta.categories.map((c) => c.name),
  };
  return {
    rows,
    meta,
    crosswalk: [...crosswalk.values()].sort((a, b) => a.recipient_name.localeCompare(b.recipient_name)),
    stats: { negativeDisbursementRows, militaryExceedsTotalRows, sourceRows },
  };
}

/** Hard checks. Throws {@link AidDataError} naming the offender. */
export function validateAid(rows: readonly AidRow[], meta: AidMeta, rawMeta: RawMeta, raw: readonly RawYear[]): void {
  const seen = new Set<string>();
  const years = new Set(meta.years.map((y) => y.fiscal_year));
  const cats = new Set(meta.sector_categories);
  for (const r of rows) {
    const k = `${r.recipient_type}|${r.recipient_name}|${r.fiscal_year}|${r.sector_category}`;
    if (seen.has(k)) throw new AidDataError(`duplicate grain key ${k}`);
    seen.add(k);
    if (!years.has(r.fiscal_year)) throw new AidDataError(`${k}: fiscal year outside the served range`);
    if (!cats.has(r.sector_category)) throw new AidDataError(`${k}: sector category not in the source taxonomy`);
    if (!Number.isFinite(r.disbursements_usd) || (r.obligations_usd !== null && !Number.isFinite(r.obligations_usd))) throw new AidDataError(`${k}: non-finite amount`);
  }
  const byYear = new Map<number, number>();
  for (const r of rows) byYear.set(r.fiscal_year, (byYear.get(r.fiscal_year) ?? 0) + r.disbursements_usd);
  for (const [fy, total] of byYear) if (total <= 0) throw new AidDataError(`FY${fy}: national disbursements total ${total} is not positive`);
  // The snapshot must be the whole fetch: row counts per transaction type equal what the API reported.
  const got = { [TX_OBLIGATIONS]: 0, [TX_DISBURSEMENTS]: 0 } as Record<number, number>;
  for (const y of raw) for (const r of y.sector_rows) got[r[4]]++;
  for (const tx of [TX_OBLIGATIONS, TX_DISBURSEMENTS]) {
    if (got[tx] !== rawMeta.expected_records.sector[String(tx)]) throw new AidDataError(`sector rows for transaction type ${tx}: snapshot has ${got[tx]}, source reported ${rawMeta.expected_records.sector[String(tx)]} (truncated or stale fetch?)`);
  }
}

/** §7 cross-checks against Pew Research Center's July 21, 2026 analysis (data as of July 1, 2026). Cross-check targets only, never data. */
export interface Target {
  label: string;
  fy: number;
  expected: number;
  /** Nominal comparison is only valid for FY2025 and earlier here; FY2026 is a sanity check. */
  sanityOnly?: boolean;
  value: (rows: readonly AidRow[]) => number;
}
const sum = (rows: readonly AidRow[], f: (r: AidRow) => boolean, g: (r: AidRow) => number = (r) => r.disbursements_usd) => rows.filter(f).reduce((s, r) => s + g(r), 0);
const total = (fy: number) => (rows: readonly AidRow[]) => sum(rows, (r) => r.fiscal_year === fy);
const cat = (fy: number, c: string) => (rows: readonly AidRow[]) => sum(rows, (r) => r.fiscal_year === fy && r.sector_category === c);
const country = (fy: number, code: string, g?: (r: AidRow) => number) => (rows: readonly AidRow[]) => sum(rows, (r) => r.fiscal_year === fy && r.country_key === code, g);
const share = (fy: number, type: AidRow["recipient_type"]) => (rows: readonly AidRow[]) => (sum(rows, (r) => r.fiscal_year === fy && r.recipient_type === type) / total(fy)(rows)) * 100;

export const TARGETS: readonly Target[] = [
  { label: "FY2025 total disbursements", fy: 2025, expected: 47_317_850_037, value: total(2025) },
  { label: "FY2024 total disbursements", fy: 2024, expected: 71_576_179_502, value: total(2024) },
  { label: "FY2025 Peace and Security", fy: 2025, expected: 7_316_232_703, value: cat(2025, "Peace and Security") },
  { label: "FY2024 Peace and Security", fy: 2024, expected: 18_246_109_424, value: cat(2024, "Peace and Security") },
  { label: "FY2025 Health", fy: 2025, expected: 10_933_117_708, value: cat(2025, "Health") },
  { label: "FY2025 Humanitarian Assistance", fy: 2025, expected: 8_987_429_153, value: cat(2025, "Humanitarian Assistance") },
  { label: "FY2025 Ukraine total", fy: 2025, expected: 6_697_398_275, value: country(2025, "UKR") },
  { label: "FY2025 Ukraine military", fy: 2025, expected: 1_011_759_817, value: country(2025, "UKR", (r) => r.military_disbursements_usd) },
  { label: "FY2025 Ukraine non-military", fy: 2025, expected: 5_685_638_458, value: (rows) => country(2025, "UKR")(rows) - country(2025, "UKR", (r) => r.military_disbursements_usd)(rows) },
  { label: "FY2025 Israel total", fy: 2025, expected: 3_310_740_466, value: country(2025, "ISR") },
  { label: "FY2025 Israel military", fy: 2025, expected: 3_305_572_360, value: country(2025, "ISR", (r) => r.military_disbursements_usd) },
  { label: "FY2025 Jordan total", fy: 2025, expected: 1_652_265_359, value: country(2025, "JOR") },
  { label: "FY2025 global-program share (%)", fy: 2025, expected: 26.5, value: share(2025, "global") },
  { label: "FY2025 regional share (%)", fy: 2025, expected: 7.7, value: share(2025, "regional") },
  { label: "FY2026 total (Pew: through Jul 1)", fy: 2026, expected: 6_969_294_181, sanityOnly: true, value: total(2026) },
  { label: "FY2026 Jordan (Pew: through Jul 1)", fy: 2026, expected: 965_700_000, sanityOnly: true, value: country(2026, "JOR") },
  { label: "FY2026 Ukraine (Pew: through Jul 1)", fy: 2026, expected: 214_400_000, sanityOnly: true, value: country(2026, "UKR") },
];

export interface ReconRow {
  label: string;
  expected: number;
  actual: number;
  diff_pct: number;
  status: "pass" | "investigate" | "stop" | "sanity";
}
export function reconcile(rows: readonly AidRow[]): ReconRow[] {
  return TARGETS.map((t) => {
    const actual = t.value(rows);
    const diff = ((actual - t.expected) / t.expected) * 100;
    const mag = Math.abs(diff);
    const status: ReconRow["status"] = t.sanityOnly ? "sanity" : mag <= 0.5 ? "pass" : mag <= 5 ? "investigate" : "stop";
    return { label: t.label, expected: t.expected, actual: Math.round(actual * 100) / 100, diff_pct: Math.round(diff * 1000) / 1000, status };
  });
}

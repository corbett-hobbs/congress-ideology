import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { daysSinceReview, isReviewStale, MAX_PRIORITY_1, TARIFF_ACTIONS_STALE_DAYS } from "../../lib/tariff-actions-entities";
import { TariffActionsError, validateTariffActions, type ValidationContext } from "./tariff-actions";

// The real curated file and real pipeline output: no invented rows.
const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as unknown;
const reference = read("pipeline/reference/tariff-actions.json");
const countries = read("pipeline/output/countries.json") as { country_code: string; is_aggregate: boolean }[];
const eos = read("pipeline/output/executive_orders.json") as { eo_number: number }[];
const ctx: ValidationContext = {
  countryCodes: new Set(countries.filter((c) => !c.is_aggregate).map((c) => c.country_code)),
  eoNumbers: new Set(eos.map((e) => e.eo_number)),
  today: "2026-10-01",
};
type Row = Record<string, unknown> & { action_id: string; date: string; sources: { kind: string }[] };
const clone = () => JSON.parse(JSON.stringify(reference)) as { last_reviewed: string; actions: Row[] };
const bad = (mutate: (f: ReturnType<typeof clone>) => void, re: RegExp) => {
  const f = clone();
  mutate(f);
  expect(() => validateTariffActions(f, ctx)).toThrow(re);
};

describe("the curated file", () => {
  const file = validateTariffActions(reference, ctx);
  it("passes every check", () => expect(file.actions.length).toBeGreaterThan(20));
  it("has exactly one cut-over: the day IEEPA collection ended", () => {
    const cut = file.actions.filter((a) => a.is_cutover);
    expect(cut.map((a) => a.date)).toEqual(["2026-02-24"]);
    expect(cut[0].flag_priority).toBe(1);
  });
  it("flags the five selected events at priority 1", () => {
    expect(file.actions.filter((a) => a.flag_priority === 1).map((a) => a.date)).toEqual(["2018-07-06", "2025-04-05", "2025-08-07", "2026-02-24", "2026-07-24"]);
  });
  it("every row has a primary source with an https URL", () => {
    for (const a of file.actions) expect(a.sources.some((s) => s.kind === "primary" && s.url.startsWith("https://")), a.action_id).toBe(true);
  });
  it("the §301 forced-labor row is scoped to real country codes and is under challenge", () => {
    const r = file.actions.find((a) => a.date === "2026-07-24")!;
    expect(Array.isArray(r.countries) && r.countries.length).toBe(86);
    expect(r.legal_status).toBe("in_effect_under_challenge");
  });
});

describe("validation fails loudly", () => {
  it("duplicate action_id", () => bad((f) => (f.actions[1].action_id = f.actions[0].action_id), /duplicate action_id/));
  it("a date in the future", () => bad((f) => (f.actions[f.actions.length - 1].date = "2026-10-02"), /in the future|must start with/));
  it("a date that does not exist", () => bad((f) => { f.actions[0].date = "2018-02-30"; f.actions[0].action_id = "2018-02-30-x"; }, /not a real date/));
  it("an unknown country code", () => bad((f) => (f.actions.find((a) => a.countries !== "all")!.countries = ["ZZZ"]), /not a non-aggregate code/));
  it("an aggregate country code", () => bad((f) => (f.actions.find((a) => a.countries !== "all")!.countries = ["AGG_0003"]), /not a non-aggregate code/));
  it("a row with no primary source", () => bad((f) => f.actions[0].sources.forEach((s) => (s.kind = "secondary")), /at least one primary source/));
  it("a malformed source URL", () => bad((f) => ((f.actions[0].sources[0] as Record<string, unknown>).url = "not a url"), /schema/));
  it("no cut-over row", () => bad((f) => f.actions.forEach((a) => (a.is_cutover = false)), /exactly one row/));
  it("two cut-over rows", () => bad((f) => (f.actions[0].is_cutover = true), /exactly one row/));
  it("too many priority-1 rows", () => bad((f) => f.actions.forEach((a) => (a.flag_priority = 1)), new RegExp(`cap is ${MAX_PRIORITY_1}`)));
  it("rows out of order", () => bad((f) => f.actions.reverse(), /not sorted/));
  it("an EO number the executive-orders data does not have", () => bad((f) => (f.actions.find((a) => a.links)!.links = { eo_numbers: [99999] }), /not in executive_orders/));
  it("a malformed Federal Register document number", () => bad((f) => (f.actions[0].federal_register_documents = ["2018-5478"]), /schema/));
  it("announced after effective", () => bad((f) => (f.actions[0].announced_date = "2030-01-01"), /after the effective date|in the future/));
  it("an unknown field", () => bad((f) => (f.actions[0].computed_rate = 12), /schema/));
  it("a review date in the future", () => bad((f) => (f.last_reviewed = "2026-10-02"), /in the future/));
});

describe("staleness", () => {
  it("is stale only after the threshold", () => {
    expect(TARIFF_ACTIONS_STALE_DAYS).toBe(30);
    expect(daysSinceReview("2026-09-01", "2026-10-01")).toBe(30);
    expect(isReviewStale("2026-09-01", "2026-10-01")).toBe(false);
    expect(isReviewStale("2026-08-31", "2026-10-01")).toBe(true);
  });
});

describe("error type", () => {
  it("is a TariffActionsError", () => {
    const f = clone();
    f.actions.forEach((a) => (a.is_cutover = false));
    expect(() => validateTariffActions(f, ctx)).toThrow(TariffActionsError);
  });
});

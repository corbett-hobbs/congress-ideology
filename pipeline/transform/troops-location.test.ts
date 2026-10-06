import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { DMDC_RAW_DIR, dmdcRawPath, manifest, parseManifest, periodFromFileName, selectLocationFiles } from "../fetch/dmdc-location-lib";
import { TroopsDataError, type TroopsRow } from "../../lib/troops-entities";
import { ALIASES, ARMY_NOT_REPORTED, OVERSEAS_EXCEPTIONS, TERRITORY_SOURCES, buildTroops, type BuildResult, type PeriodInput } from "./troops-location";
import { parseLocationFile, type ParsedFile } from "./troops-location-parse";

// Real committed raw files, not fixtures (the foreign-aid tests' pattern, but the input is the DMDC xlsx itself).
const manifestFiles = parseManifest(JSON.parse(readFileSync(`${DMDC_RAW_DIR}/manifest.json`, "utf8"))).files;
let inputs: PeriodInput[];
let built: BuildResult;

beforeAll(() => {
  inputs = manifestFiles.map((f) => ({ period: f.period, file: `${f.period}.xlsx`, parsed: parseLocationFile(readFileSync(dmdcRawPath(f.period))) }));
  built = buildTroops(inputs);
});

const row = (period: string, name: string): TroopsRow | undefined => built.rows.find((r) => r.period === period && r.name === name);
const clone = (i: PeriodInput): PeriodInput => ({ ...i, parsed: structuredClone(i.parsed) as ParsedFile });
const input = (period: string) => clone(inputs.find((i) => i.period === period)!);
const withPeriod = (swap: PeriodInput) => inputs.map((i) => (i.period === swap.period ? swap : i));

describe("fetch lib", () => {
  it("derives the period from the file name (YYMM is the quarter-end month)", () => {
    expect(periodFromFileName("DMDC_Website_Location_Report_0809.xlsx")).toBe("2008-09");
    expect(periodFromFileName("DMDC_Website_Location_Report_1709_old.xlsx")).toBe("2017-09");
    expect(periodFromFileName("DMDC_Website_Location_Report_2603.xlsx")).toBe("2026-03");
    expect(periodFromFileName("DMDC_Website_Location_Report_2602.xlsx")).toBeNull();
  });
  it("selects only milRegionCountry xlsx files from 2008-09, from anywhere in the page JSON", () => {
    const f = (fileName: string, groupName = "milRegionCountry", extension = "xlsx") => ({ fileName, fileId: "1", groupName, extension, uploadDate: "2026-05-07", size: "10" });
    const doc = { data: { a: [{ items: [f("DMDC_Website_Location_Report_2603.xlsx"), f("ms0_202607.pdf", "other", "pdf")] }, f("DMDC_Website_Location_Report_0309.xlsx")] } };
    expect(selectLocationFiles(doc).map((x) => x.period)).toEqual(["2026-03"]);
    expect(() => selectLocationFiles({ a: [f("DMDC_Website_Location_Report_2603.xlsx"), f("DMDC_Website_Location_Report_2603_old.xlsx")] })).toThrow(/two files/);
  });
  it("has a manifest entry for every raw file, 56 periods Sep 2008 to Mar 2026, with a valid shape", () => {
    expect(manifest.parse({ files: manifestFiles }).files).toHaveLength(56);
    expect(manifestFiles[0].period).toBe("2008-09");
    expect(manifestFiles[55].period).toBe("2026-03");
  });
});

describe("gate 1 and 2: every file parses and the overseas rows reconcile", () => {
  it("builds all 56 periods (the transform did not throw)", () => {
    expect(built.meta.periods_covered).toHaveLength(56);
    expect(built.meta.latest_period).toBe("2026-03");
    expect(built.meta.data_through).toBe("2026-03-31");
  });
  it("matches the documented exception table row for row", () => {
    const got = Object.fromEntries(built.meta.periods.filter((p) => p.overseas_gate === "documented_exception").map((p) => [p.period, p.overseas_gap]));
    expect(got).toEqual({
      "2013-09": 8,
      "2017-12": 612,
      "2020-12": -534,
      "2021-03": -495,
      "2021-06": -427,
      "2021-09": -189,
      "2022-06": -329,
      "2024-09": -11,
    });
    expect(Object.fromEntries(Object.entries(OVERSEAS_EXCEPTIONS).map(([k, v]) => [k, v.gap]))).toEqual(got);
  });
  it("is exact in 45 of 53 numeric periods, with 3 explicitly untestable", () => {
    const n = (g: string) => built.meta.periods.filter((p) => p.overseas_gate === g).length;
    expect(n("exact")).toBe(45);
    expect(n("documented_exception")).toBe(8);
    expect(n("untestable")).toBe(3);
    expect(built.meta.periods.filter((p) => p.overseas_gate === "untestable").map((p) => p.period)).toEqual([...ARMY_NOT_REPORTED]);
    for (const p of built.meta.periods.filter((p) => p.overseas_gate === "exact")) expect(p.overseas_gap).toBe(0);
  });
  it("reconciles the U.S. rows with the printed U.S. total in every testable period", () => {
    for (const p of built.meta.periods) expect(p.us_gap).toBe(p.overseas_gate === "untestable" ? null : 0);
  });
  it("treats Mar 2017's stale printed grand total as a documented exception, and no other period has one", () => {
    const off = built.meta.periods.filter((p) => p.grand_gap !== null && p.grand_gap !== 0);
    expect(off.map((p) => [p.period, p.grand_gap])).toEqual([["2017-03", -3062]]);
    expect(built.meta.exceptions.filter((e) => e.gate === "grand").map((e) => e.period)).toEqual(["2017-03"]);
  });
  it("still reconciles Navy/Marine Corps/Air Force/Coast Guard when Army is N/A (Jun 2023: -2 MC, -1 AF)", () => {
    const g = Object.fromEntries(built.notes.branch_gaps_when_total_unreadable.map((x) => [x.period, x.gaps]));
    expect(Object.keys(g)).toEqual(["2022-12", "2023-03", "2023-06"]);
    expect(g["2022-12"]).toEqual({ navy: 0, marine_corps: 0, air_force: 0, coast_guard: 0 });
    expect(g["2023-06"]).toMatchObject({ marine_corps: -2, air_force: -1 });
  });
  it("emits the dropped Sep 2013 duplicate ZIMBABWE row in meta, and keeps one row", () => {
    const p = built.meta.periods.find((p) => p.period === "2013-09")!;
    expect(p.duplicate_rows_dropped).toEqual([{ source_name: "ZIMBABWE", total: 8 }]);
    expect(built.rows.filter((r) => r.period === "2013-09" && r.name === "Zimbabwe")).toHaveLength(1);
  });
});

describe("spot values across the three layout eras", () => {
  it("2008-2017 (group header row 6 / 5, 6 columns)", () => {
    expect(row("2008-09", "Iraq")?.total).toBe(110793);
    expect(row("2008-09", "Afghanistan")?.total).toBe(23359);
    expect(row("2008-09", "Kuwait")?.total).toBe(42291);
    expect(row("2011-09", "Afghanistan")?.total).toBe(82177);
    expect(row("2014-09", "Iraq")?.total).toBe(498);
    expect(row("2014-09", "Syria")).toBeUndefined(); // absent that year, not 0
    expect(row("2017-03", "Iraq")?.total).toBe(5462);
    expect(row("2017-03", "Bahrain")?.total).toBe(5259);
  });
  it("Dec 2017-Sep 2022 (group header row 8 from Jun 2022; Air Force/Space Force merged from Dec 2021)", () => {
    expect(row("2017-12", "Kuwait")?.total).toBe(2082);
    expect(row("2018-06", "Djibouti")?.total).toBe(30);
    expect(row("2020-12", "Niger")?.total).toBe(21);
    expect(row("2021-12", "Iraq")?.total).toBe(158);
    expect(row("2022-06", "Iraq")?.total).toBe(153);
    expect(row("2022-06", "Germany")?.total).toBe(36056); // row TOTAL differs from its branch sum (the Jun 2022 exception)
  });
  it("Sep 2023-Mar 2026 (group header row 5 from Sep 2024; Space Force column)", () => {
    expect(row("2023-09", "Djibouti")?.total).toBe(409);
    expect(row("2025-06", "Bahrain")?.total).toBe(3391);
    expect(row("2025-12", "Japan")?.total).toBe(54288);
    expect(row("2025-12", "Germany")?.total).toBe(36436);
    expect(row("2025-12", "South Korea")?.total).toBe(23495);
    expect(row("2026-03", "Kuwait")?.total).toBe(540);
    expect(row("2026-03", "Bahrain")?.total).toBe(3151);
    expect(row("2026-03", "Guam")?.total).toBe(7137);
  });
});

describe("suppressed vs 0 vs null", () => {
  it("prints Afghanistan, Iraq and Syria as suppressed (never 0) Dec 2017 through Sep 2021", () => {
    for (const period of built.meta.periods_covered.filter((p) => p >= "2017-12" && p <= "2021-09")) {
      for (const host of ["Afghanistan", "Iraq", "Syria"]) {
        const r = row(period, host)!;
        expect([period, host, r.state]).toEqual([period, host, "suppressed"]);
        expect([r.army, r.navy, r.marine_corps, r.air_force, r.coast_guard, r.total]).toEqual([null, null, null, null, null, null]);
      }
    }
    expect(built.meta.break.not_reported_periods[0]).toBe("2017-12");
    expect(built.meta.break.not_reported_periods.at(-1)).toBe("2021-09");
  });
  it("has real values at Dec 2021: Afghanistan 6, Iraq 158", () => {
    expect(row("2021-12", "Afghanistan")).toMatchObject({ state: "value", total: 6 });
    expect(row("2021-12", "Iraq")).toMatchObject({ state: "value", total: 158 });
  });
  it("keeps a printed 0 as a value, distinct from suppressed", () => {
    expect(row("2022-06", "Afghanistan")).toMatchObject({ state: "value", total: 0 });
    expect(row("2023-09", "Iraq")).toMatchObject({ state: "value", total: 0 });
    expect(row("2022-03", "Iraq")).toMatchObject({ state: "value", total: 11 });
    expect(row("2022-03", "Afghanistan")?.state).toBe("suppressed");
  });
  it("marks N/A as null (Army and Total) in Dec 2022, Mar 2023 and Jun 2023 while the other branches keep their numbers", () => {
    for (const period of ARMY_NOT_REPORTED) {
      const r = row(period, "Japan")!;
      expect(r.state).toBe("null");
      expect(r.army).toBeNull();
      expect(r.total).toBeNull();
      expect(r.navy).not.toBeNull();
      expect(built.meta.periods.find((p) => p.period === period)!.army_not_reported).toBe(true);
    }
    expect(row("2022-09", "Japan")?.army).not.toBeNull();
  });
});

describe("territories, abroad and Space Force", () => {
  it("classifies exactly the five territories separately from hosts", () => {
    const territories = new Set(built.rows.filter((r) => r.class === "territory").map((r) => r.source_name));
    expect([...territories].sort()).toEqual([...TERRITORY_SOURCES].sort());
    expect(row("2026-03", "Guam")?.class).toBe("territory");
    expect(row("2026-03", "Japan")?.class).toBe("host");
  });
  it("subtracts the territory list from the printed overseas total", () => {
    const p = built.meta.periods.find((x) => x.period === "2026-03")!;
    const terr = built.rows.filter((r) => r.period === "2026-03" && r.class === "territory").reduce((s, r) => s + (r.total ?? 0), 0);
    expect(p.territory_total).toBe(terr);
    expect(p.abroad_total).toBe(p.printed.overseas_total.total! - terr);
    expect(terr).toBeGreaterThan(7137); // Guam plus the others
  });
  it("omits abroad totals for Dec 2022-Jun 2023 and says so in meta", () => {
    expect(built.meta.derived.abroad_omitted_periods).toEqual([...ARMY_NOT_REPORTED]);
    for (const period of ARMY_NOT_REPORTED) expect(built.meta.periods.find((p) => p.period === period)!.abroad_total).toBeNull();
  });
  it("classifies UNKNOWN / ZZ-UNKNOWN / UNDEFINED as afloat_unassigned", () => {
    for (const s of ["UNKNOWN", "ZZ-UNKNOWN", "UNDEFINED"]) expect(ALIASES.find((a) => a.source === s)?.class).toBe("afloat_unassigned");
    expect(row("2008-09", "Afloat / unassigned")?.source_name).toBe("UNKNOWN");
    expect(row("2022-06", "Afloat / unassigned")?.source_name).toBe("UNDEFINED");
  });
  it("records the Space Force merge as metadata, never splitting it", () => {
    expect(built.meta.space_force.merged_periods).toEqual(["2021-12", "2022-03", "2022-06", "2022-09", "2022-12", "2023-03", "2023-06"]);
    expect(built.meta.space_force.separate_from).toBe("2023-09");
    const sf = (period: string) => built.meta.periods.find((p) => p.period === period)!.space_force;
    expect(sf("2021-09")).toBe("none");
    expect(sf("2021-12")).toBe("merged_into_air_force");
    expect(sf("2023-09")).toBe("separate");
    expect(row("2022-06", "Japan")?.space_force).toBeNull();
    expect(row("2026-03", "Japan")?.space_force).not.toBeNull();
  });
});

describe("gate 5: the Dec 2017 break and the contingency-row removal are explicit", () => {
  it("carries the break in meta and on the periods", () => {
    expect(built.meta.break.first_period_after).toBe("2017-12");
    expect(built.meta.break.contingency_hosts_not_reported).toEqual(["Afghanistan", "Iraq", "Syria"]);
    expect(built.meta.periods.find((p) => p.period === "2017-09")!.basis).toBe("includes_deployed");
    expect(built.meta.periods.find((p) => p.period === "2017-12")!.basis).toBe("permanently_assigned");
    expect(built.meta.periods.find((p) => p.period === "2017-12")!.flags).toContain("series_break_permanent_assignment_only");
  });
  it("carries the removal: Afghanistan's row is gone from Sep 2023, Iraq's and Syria's from Dec 2023", () => {
    const by = Object.fromEntries(built.meta.removal.hosts.map((h) => [h.name, h]));
    expect(by.Afghanistan).toMatchObject({ last_row_period: "2023-06", first_period_without_rows: "2023-09" });
    expect(by.Iraq).toMatchObject({ last_row_period: "2023-09", first_period_without_rows: "2023-12" });
    expect(by.Syria).toMatchObject({ last_row_period: "2023-09", first_period_without_rows: "2023-12" });
    for (const h of ["Afghanistan", "Iraq", "Syria"]) expect(built.rows.some((r) => r.name === h && r.period >= "2023-12")).toBe(false);
  });
});

describe("gate 6: determinism", () => {
  it("builds byte-identical output twice", () => {
    const again = buildTroops(inputs.map(clone));
    expect(JSON.stringify(again)).toBe(JSON.stringify(built));
  });
});

describe("alias table", () => {
  it("has unique source labels and a valid ISO3 or null", () => {
    expect(new Set(ALIASES.map((a) => a.source)).size).toBe(ALIASES.length);
    for (const a of ALIASES) if (a.iso3 !== null) expect(a.iso3).toMatch(/^[A-Z]{3}$/);
  });
  it("maps every label in the raw files, so nothing falls back to an unmapped host", () => {
    expect(built.notes.unmapped_zero_troop).toEqual([]);
    for (const i of inputs) for (const r of i.parsed.rows.filter((r) => r.section === "overseas")) expect(ALIASES.some((a) => a.source === r.name), `${i.period} ${r.name}`).toBe(true);
  });
  it("folds name variants to one canonical name and the right ISO3", () => {
    expect(ALIASES.find((a) => a.source === "KOREA, SOUTH")).toMatchObject({ name: "South Korea", iso3: "KOR" });
    expect(ALIASES.find((a) => a.source === "CONGO (KINSHASA)")?.iso3).toBe("COD");
    expect(ALIASES.find((a) => a.source === "CONGO (BRAZZAVILLE)")?.iso3).toBe("COG");
    expect(row("2009-09", "Germany")?.source_name).toBe("GERMANY + GERMANY, FEDERAL REPUBLIC OF");
  });
});

describe("negative tests: the gates fail loudly", () => {
  it("fails when a file's As-of date does not match its period", () => {
    const bad = input("2025-12");
    bad.parsed.asOf = "2025-09-30";
    expect(() => buildTroops(withPeriod(bad))).toThrow(/As of 2025-09-30.*2025-12/);
  });
  it("fails on an unmapped country that carries troops", () => {
    const bad = input("2025-12");
    const r = bad.parsed.rows.find((x) => x.section === "overseas" && x.name === "JAPAN")!;
    r.name = "ATLANTIS";
    expect(() => buildTroops(withPeriod(bad))).toThrow(/unmapped name "ATLANTIS"/);
  });
  it("fails on a broken overseas total", () => {
    const bad = input("2025-12");
    const t = bad.parsed.printed.overseas.total!;
    if (t.kind !== "value") throw new Error("test setup");
    t.n += 1;
    expect(() => buildTroops(withPeriod(bad))).toThrow(/Σ overseas rows − printed OVERSEAS TOTAL = -1/);
  });
  it("fails when a documented exception period stops showing its documented gap", () => {
    const bad = input("2024-09");
    const t = bad.parsed.printed.overseas.total!;
    if (t.kind !== "value") throw new Error("test setup");
    t.n -= 11; // the printed total now matches the rows exactly: no longer the documented -11
    expect(() => buildTroops(withPeriod(bad))).toThrow(/documented exception is -11/);
  });
  it("fails on a broken U.S. total", () => {
    const bad = input("2025-12");
    const t = bad.parsed.printed.us.total!;
    if (t.kind !== "value") throw new Error("test setup");
    t.n += 5;
    expect(() => buildTroops(withPeriod(bad))).toThrow(/UNITED STATES TOTAL/);
  });
  it("keeps Wake Island (not one of the five G2 territories) a host", () => {
    const a = ALIASES.find((x) => x.source === "WAKE ISLAND");
    expect(a?.class).toBe("host"); // not on the G2 list, so it stays a host
  });
  it("throws TroopsDataError, not a bare Error", () => {
    const bad = input("2025-12");
    bad.parsed.asOf = "2020-01-01";
    expect(() => buildTroops(withPeriod(bad))).toThrow(TroopsDataError);
  });
});

describe("parser", () => {
  it("rejects a workbook with no ACTIVE DUTY header", () => {
    expect(() => parseLocationFile(readFileSync(`${DMDC_RAW_DIR}/manifest.json`))).toThrow();
  });
  it("finds the group header by text across the three drift eras", () => {
    expect(parseLocationFile(readFileSync(dmdcRawPath("2008-09"))).fields).toEqual(["army", "navy", "marine_corps", "air_force", "coast_guard", "total"]);
    expect(parseLocationFile(readFileSync(dmdcRawPath("2022-06"))).spaceForce).toBe("merged_into_air_force");
    expect(parseLocationFile(readFileSync(dmdcRawPath("2024-09"))).fields).toContain("space_force");
  });
});

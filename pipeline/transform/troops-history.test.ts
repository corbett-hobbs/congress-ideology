import { beforeAll, describe, expect, it } from "vitest";
import { regionOf } from "../../lib/troops-regions";
import { TroopsDataError, type HistoryRow } from "../../lib/troops-entities";
import { ALIASES, DMDC_YEARS, ESTIMATE_YEARS, IMPUTED_YEARS, RECONCILE_EXCEPTIONS, buildHistory, type HistoryBuild, type ReferenceRow, type TroopdataRow } from "./troops-history";
import { readReference, readTroopdata } from "./troops-history-run";

// Real committed inputs (raw/troopdata + reference/dmdc-309a-sep.csv), not fixtures.
let td: TroopdataRow[];
let ref: ReferenceRow[];
let commit: string;
let built: HistoryBuild;

beforeAll(async () => {
  const t = await readTroopdata();
  td = t.rows;
  commit = t.commit;
  ref = await readReference();
  built = buildHistory(td, ref, commit);
});

const row = (year: number, name: string): HistoryRow | undefined => built.rows.find((r) => r.year === year && r.name === name);
const yearMeta = (year: number) => built.meta.years.find((y) => y.year === year)!;

describe("coverage", () => {
  it("covers June 1950, June 1953-56 and September 1957-2007, with the imputed 1951-52 left out", () => {
    const years = built.meta.years.map((y) => y.year);
    expect(years).toEqual([1950, ...Array.from({ length: 55 }, (_, i) => 1953 + i)]);
    expect(years).not.toContain(1951);
    for (const y of IMPUTED_YEARS) expect(built.rows.some((r) => r.year === y)).toBe(false);
    expect(built.meta.gaps[0].years).toEqual([1951, 1952]);
    expect(yearMeta(1950).snapshot).toBe("june");
    expect(yearMeta(1956).snapshot).toBe("june");
    expect(yearMeta(1957).snapshot).toBe("september");
  });
  it("takes DMDC's own 309A for Sep 1996 and 1998-2005 and troopdata for everything else", () => {
    const dm = built.meta.years.filter((y) => y.source === "dmdc_309a").map((y) => y.year);
    expect(dm).toEqual([...DMDC_YEARS]);
    expect(built.meta.years.filter((y) => y.source === "troopdata")).toHaveLength(47);
    for (const y of [1995, 1997, 2006, 2007]) expect(yearMeta(y).source).toBe("troopdata");
  });
  it("records the substitutions and the end of the series", () => {
    expect(yearMeta(1997).flags).toContain("no_dmdc_table_online");
    expect(built.meta.substitutions.map((s) => s.year).sort()).toEqual([1995, 1997, 2006]);
    expect(built.meta.last_year).toBe(2007);
    expect(built.meta.handoff).toMatch(/Sep 2008/);
  });
});

describe("gate: DMDC 309A rows reconcile with the printed foreign total", () => {
  it("is exact in all nine DMDC years (host rows + afloat + undistributed = Total - Foreign Countries)", () => {
    for (const y of DMDC_YEARS) {
      const m = yearMeta(y);
      const rows = built.rows.filter((r) => r.year === y && r.class !== "territory");
      // special locations that 309A lists with the U.S. (Wake, Johnston, Midway, Micronesia, Palau, TTPI) are hosts in this series
      const inForeignSection = ref.filter((r) => r.year === y).sort((a, b) => a.seq - b.seq);
      const printed = inForeignSection.find((r) => /^Total - Foreign Countries/.test(r.name))!.total;
      expect(m.dmdc_foreign_total).toBe(printed);
      expect(rows.reduce((s, r) => s + (r.total ?? 0), 0)).toBe(m.abroad_total);
      expect(m.abroad_total).toBeGreaterThanOrEqual(printed);
      expect(m.abroad_total - printed).toBeLessThan(500); // only the handful of U.S.-section special locations on top
    }
  });
  it("has the afloat and undistributed row (regional Afloat rows + Total - Undistributed)", () => {
    expect(row(2003, "Afloat / unassigned")).toMatchObject({ class: "afloat_unassigned", total: 47491, source: "dmdc_309a" });
    expect(row(2005, "Afloat / unassigned")?.total).toBeGreaterThan(100000); // Undistributed alone is 101,074
    expect(yearMeta(1997).afloat_unassigned_total).toBeNull();
  });
});

describe("gate: troopdata and DMDC agree exactly where both have the host", () => {
  it("matches every host DMDC puts at 1,000 or more, except the documented Serbia/Kosovo gap", () => {
    for (const r of built.notes.reconcile) {
      if (r.year === 2003 || r.year === 2004) {
        expect(r.checked).toBe(0);
        continue;
      }
      expect(r.checked).toBeGreaterThanOrEqual(10);
      expect(r.exact + r.documented_exceptions).toBe(r.checked);
    }
    expect(RECONCILE_EXCEPTIONS.Serbia).toEqual([1999, 2000, 2001, 2002, 2005]);
    expect(built.notes.reconcile.find((r) => r.year === 1999)?.documented_exceptions).toBe(1);
  });
  it("finds troopdata empty for the large hosts in Sep 2003 and Sep 2004, so DMDC's table is the source", () => {
    expect(td.find((r) => r.year === 2003 && r.month === "September" && r.countryname === "Germany")?.troops_ad).toBe(0);
    expect(row(2003, "Germany")).toMatchObject({ total: 74796, source: "dmdc_309a" });
    expect(row(2003, "Japan")?.total).toBe(40519);
    expect(row(2004, "Germany")?.total).toBe(76058);
  });
});

describe("spot values", () => {
  it("reads the early years from troopdata", () => {
    expect(row(1950, "Japan")).toMatchObject({ total: 115306, snapshot: "june", source: "troopdata", quality: "reported" });
    expect(row(1957, "Germany")).toMatchObject({ total: 244407, snapshot: "september" });
  });
  it("keeps the unstamped South Vietnam war years (source NA in troopdata, positive troops)", () => {
    expect(row(1968, "Vietnam")?.total).toBe(537377);
    expect(row(1968, "Vietnam")?.source_name).toBe("South Vietnam");
    expect(yearMeta(1968).flags.some((f) => f.startsWith("unstamped_source") && f.includes("South Vietnam"))).toBe(true);
    expect(row(1975, "Vietnam")).toBeUndefined(); // 0 with no source: absent, not a row of 0
  });
  it("reads DMDC's years with branches", () => {
    expect(row(1996, "Germany")).toMatchObject({ total: 48878, army: 33330, navy: 282, marine_corps: 168, air_force: 15098 });
    expect(row(2005, "Germany")?.total).toBe(66418);
    expect(row(2005, "South Korea")?.total).toBe(30983);
  });
  it("folds name variants (Korea, Republic of / South Korea; Congo variants)", () => {
    expect(row(2003, "South Korea")?.source_name).toBe("Korea, Republic of");
    expect(row(2003, "North Korea")).toBeDefined();
    expect(ALIASES.find((a) => a.system === "dmdc_309a" && a.source === "Congo (Kinshasa)")?.iso3).toBe("COD");
    expect(ALIASES.find((a) => a.system === "troopdata" && a.source === "Congo")?.iso3).toBe("COG");
  });
});

describe("not reported is not zero; estimates are flagged", () => {
  it("prints Iraq, Kuwait and Afghanistan as suppressed with no count in 2003-2005", () => {
    for (const y of [2003, 2004, 2005]) {
      for (const h of ["Iraq", "Kuwait", "Afghanistan"]) {
        expect(row(y, h), `${y} ${h}`).toMatchObject({ state: "suppressed", total: null, army: null });
      }
      expect(yearMeta(y).suppressed).toEqual(["Afghanistan", "Iraq", "Kuwait"]);
    }
    expect(yearMeta(2003).flags).toContain("printed_total_excludes_oif_deployed");
  });
  it("flags every Sep 2006 and 2007 row as an estimate and nothing earlier", () => {
    for (const r of built.rows) expect(r.quality).toBe((ESTIMATE_YEARS as readonly number[]).includes(r.year) ? "estimate" : "reported");
    expect(row(2006, "Iraq")).toMatchObject({ total: 141100, quality: "estimate" });
    expect(row(2007, "Iraq")).toMatchObject({ total: 170000, quality: "estimate" });
    expect(yearMeta(2007).flags).toContain("estimate_year_not_published_by_dmdc");
  });
});

describe("territories, classes and regions", () => {
  it("emits the five G2 territories as class territory and never as hosts", () => {
    const terr = new Set(built.rows.filter((r) => r.class === "territory").map((r) => r.name));
    expect([...terr].sort()).toEqual(["American Samoa", "Guam", "Northern Mariana Islands", "Puerto Rico", "U.S. Virgin Islands"]);
    expect(row(2003, "Guam")).toMatchObject({ class: "territory", total: 3293 });
  });
  it("does not emit troopdata's continental-U.S. row or DMDC's CONUS/Alaska/Hawaii/Transients", () => {
    expect(built.rows.some((r) => /United States|Continental|Alaska|Hawaii|Transients/.test(r.name))).toBe(false);
  });
  it("gives every host and afloat row a region", () => {
    for (const r of built.rows.filter((r) => r.class !== "territory")) expect(regionOf(r), `${r.year} ${r.name} ${r.iso3}`).not.toBeNull();
  });
  it("keeps Wake Island and the other special locations as hosts, like the location series", () => {
    expect(ALIASES.find((a) => a.system === "dmdc_309a" && a.source === "Wake Island")?.class).toBe("host");
    expect(ALIASES.find((a) => a.system === "dmdc_309a" && a.source === "Midway Islands")?.class).toBe("host");
  });
});

describe("determinism", () => {
  it("builds byte-identical output twice", () => {
    expect(JSON.stringify(buildHistory(td, ref, commit))).toBe(JSON.stringify(built));
  });
});

describe("negative tests: the gates fail loudly", () => {
  const bump = (year: number, pred: (r: ReferenceRow) => boolean, by: number) => ref.map((r) => (r.year === year && pred(r) ? { ...r, total: r.total + by } : r));
  it("fails on a broken printed foreign total", () => {
    expect(() => buildHistory(td, bump(2001, (r) => /^Total - Foreign Countries/.test(r.name), 7), commit)).toThrow(/Σ foreign rows .* − printed foreign total 254795 = -7/);
  });
  it("fails on an unmapped DMDC country that carries troops", () => {
    const bad = ref.map((r) => (r.year === 2002 && r.name === "Japan" ? { ...r, name: "Atlantis" } : r));
    expect(() => buildHistory(td, bad, commit)).toThrow(/unmapped name "Atlantis"/);
  });
  it("fails on an unmapped troopdata country that carries troops", () => {
    const bad = td.map((r) => (r.year === 1980 && r.month === "September" && r.countryname === "Japan" ? { ...r, countryname: "Atlantis" } : r));
    expect(() => buildHistory(bad, ref, commit)).toThrow(/unmapped troopdata name "Atlantis"/);
  });
  it("fails when troopdata and DMDC disagree on a large host", () => {
    const bad = td.map((r) => (r.year === 2002 && r.month === "September" && r.countryname === "Germany" ? { ...r, troops_ad: 1 } : r));
    expect(() => buildHistory(bad, ref, commit)).toThrow(/2002: Germany DMDC 68701 vs troopdata 1/);
  });
  it("fails if an imputed row shows up in a year that should be reported", () => {
    const bad = td.map((r, i) => (r.year === 1960 && r.month === "September" && i % 2 === 0 ? { ...r, source: "Stepwise Imputation" } : r));
    expect(() => buildHistory(bad, ref, commit)).toThrow(/unexpected imputed rows/);
  });
  it("fails if a DMDC year is missing from the reference", () => {
    expect(() => buildHistory(td, ref.filter((r) => r.year !== 2000), commit)).toThrow(TroopsDataError);
  });
});

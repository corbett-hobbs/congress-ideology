import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { administration } from "./executive-orders-entities";
import { aidMeta, aidRow, AidDataError } from "./foreign-aid-entities";
import {
  administrationForFiscalYear,
  buildAidPayload,
  changeAvailable,
  changeVsPrior,
  countryMilitary,
  countryValue,
  decodeAid,
  formatAidAxis,
  formatAidMoney,
  latestCompleteFiscalYear,
  militaryShareAvailable,
  niceDollarTicks,
  nonCountryValue,
  rankCountries,
  spendingByYear,
  topRecipientsByYear,
  topRuns,
  yearTotal,
} from "./foreign-aid-derive";

const OUT = join(process.cwd(), "pipeline", "output");
const read = (f: string) => JSON.parse(readFileSync(join(OUT, f), "utf8"));
const rows = (read("foreign_assistance.json") as unknown[]).map((r) => aidRow.parse(r));
const meta = aidMeta.parse(read("foreign_assistance_meta.json"));
const admins = (read("administrations.json") as unknown[]).map((r) => administration.parse(r));
const payload = buildAidPayload(rows, meta, admins);
const d = decodeAid(payload);
const name = (ci: number) => payload.countries[ci].name;
const ci = (n: string) => payload.countries.findIndex((c) => c.name === n);

describe("fixtures from the pipeline report", () => {
  it("annual totals are exact, regional and global programs included", () => {
    expect(yearTotal(d, 2024, -1, -1)).toBe(71_550_094_693);
    expect(yearTotal(d, 2025, -1, -1)).toBe(47_841_390_743);
    expect(yearTotal(d, 2026, -1, -1)).toBe(11_754_427_569);
  });
  it("FY2025 top five countries", () => {
    const top = rankCountries(d, 2025, -1).slice(0, 5).map((r) => [name(r.ci), r.value]);
    expect(top).toEqual([
      ["Ukraine", 6_752_933_185],
      ["Israel", 3_310_792_558],
      ["Jordan", 1_653_205_369],
      ["Ethiopia", 919_783_491],
      ["Democratic Republic of the Congo", 749_911_359],
    ]);
  });
  it("No. 1 runs", () => {
    const runs = topRuns(topRecipientsByYear(d, 2001, 2026, -1)).map((r) => [name(r.ci), payload.years[r.from], payload.years[r.to]]);
    expect(runs).toEqual([
      ["Israel", 2001, 2003],
      ["Iraq", 2004, 2007],
      ["Afghanistan", 2008, 2020],
      ["Israel", 2021, 2021],
      ["Ukraine", 2022, 2025],
      ["Jordan", 2026, 2026],
    ]);
  });
  it("country-attributed share of FY2025 is about 65.9%", () => {
    const total = yearTotal(d, 2025, -1, -1);
    expect(1 - nonCountryValue(d, 2025 - 2001, -1) / total).toBeCloseTo(0.659, 3);
  });
  it("every row's dollars survive the pivot", () => {
    const sum = rows.reduce((a, r) => a + r.disbursements_usd, 0);
    let t = 0;
    for (let fy = 2001; fy <= 2026; fy++) t += yearTotal(d, fy, -1, -1);
    expect(t).toBe(sum);
  });
});

describe("meta and partial years", () => {
  it("default year is the latest complete year, derived from is_partial", () => {
    expect(payload.defaultYear).toBe(2025);
    expect(latestCompleteFiscalYear({ years: [{ fiscal_year: 1, is_partial: false }, { fiscal_year: 2, is_partial: true }] })).toBe(1);
    expect(payload.partialYears).toEqual([2026]);
  });
  it("change vs. prior year is unavailable for FY2001 and partial years", () => {
    expect(changeAvailable(d, 2001)).toBe(false);
    expect(changeAvailable(d, 2026)).toBe(false);
    expect(changeAvailable(d, 2025)).toBe(true);
    expect(changeVsPrior(d, 2026, -1, -1)).toBeNull();
    expect(changeVsPrior(d, 2025, -1, -1)).toBeCloseTo(47_841_390_743 / 71_550_094_693 - 1, 6);
  });
});

describe("filters", () => {
  it("country and sector filters narrow the totals", () => {
    const ukr = ci("Ukraine");
    expect(yearTotal(d, 2025, ukr, -1)).toBe(6_752_933_185);
    expect(yearTotal(d, 2025, -1, 1)).toBe(10_937_153_596); // Health
    expect(yearTotal(d, 2025, -1, 2)).toBe(8_987_429_153); // Humanitarian
  });
  it("military: All counts every military dollar, Peace and Security only its own rows, other sectors none", () => {
    const isr = ci("Israel");
    expect(countryMilitary(d, isr, 2025 - 2001, -1)).toBe(3_305_572_360);
    expect(countryMilitary(d, isr, 2025 - 2001, 1)).toBe(0);
    let all = 0;
    let ps = 0;
    for (let c = 0; c < d.nc; c++) for (let y = 0; y < d.ny; y++) {
      all += countryMilitary(d, c, y, -1);
      ps += countryMilitary(d, c, y, 0);
    }
    expect(ps).toBeLessThanOrEqual(all);
    expect(all - ps).toBeGreaterThan(0);
    expect(militaryShareAvailable(-1)).toBe(true);
    expect(militaryShareAvailable(0)).toBe(true);
    expect(militaryShareAvailable(3)).toBe(false);
  });
  it("negative disbursements are kept as published", () => {
    expect(rows.some((r) => r.disbursements_usd < 0)).toBe(true);
    const neg = rows.find((r) => r.recipient_type === "country" && r.disbursements_usd < 0)!;
    const c = ci(neg.recipient_name);
    const s = payload.sectors.indexOf(neg.sector_category);
    expect(countryValue(d, c, neg.fiscal_year - 2001, s)).toBe(neg.disbursements_usd);
  });
  it("spending series draws only the positive slots but reports the net total", () => {
    const s = spendingByYear(d, 2025, 2025, -1, -1)[0];
    expect(s.total).toBe(47_841_390_743);
    expect(s.drawn).toBeGreaterThanOrEqual(s.total);
  });
});

describe("administrations", () => {
  const who = (fy: number) => administrationForFiscalYear(fy, admins).president;
  it("assigns each fiscal year to the administration in office for most of it", () => {
    expect([2001, 2008].map(who)).toEqual(["George W. Bush", "George W. Bush"]);
    expect([2009, 2016].map(who)).toEqual(["Barack Obama", "Barack Obama"]);
    expect([2017, 2020].map(who)).toEqual(["Donald Trump", "Donald Trump"]);
    expect([2021, 2024].map(who)).toEqual(["Joe Biden", "Joe Biden"]);
    expect(who(2025)).toBe("Donald Trump");
    expect(who(2026)).toBe("Donald Trump");
  });
  it("dropdown labels read like the other Presidency pages (start–end inauguration years)", () => {
    expect(payload.terms.map((t) => t.label)).toEqual([
      "George W. Bush (2001–2009)",
      "Barack Obama (2009–2017)",
      "Donald Trump (2017–2021)",
      "Joe Biden (2021–2025)",
      "Donald Trump (2025–present)",
    ]);
  });
  it("terms carry the fiscal-year windows the dropdown narrows to", () => {
    expect(payload.terms.map((t) => [t.last, t.fromFy, t.toFy])).toEqual([
      ["Bush", 2001, 2008],
      ["Obama", 2009, 2016],
      ["Trump", 2017, 2020],
      ["Biden", 2021, 2024],
      ["Trump", 2025, 2026],
    ]);
  });
});

describe("payload guards", () => {
  it("fails loudly when the data drifts", () => {
    expect(() => buildAidPayload(rows, { ...meta, sector_categories: [...meta.sector_categories, "Space"] }, admins)).toThrow(AidDataError);
    expect(() => buildAidPayload([...rows, rows[0]], meta, admins)).toThrow(/duplicate row/);
    const gap = { ...meta, years: meta.years.filter((y) => y.fiscal_year !== 2010) };
    expect(() => buildAidPayload(rows, gap, admins)).toThrow(/contiguous/);
  });
  it("country ids are unique and the four keyless recipients are present", () => {
    expect(new Set(payload.countries.map((c) => c.name)).size).toBe(payload.countries.length);
    for (const n of ["West Bank and Gaza", "Sudan (former)", "China (Tibet)", "Pacific Island Trust Territory"]) expect(payload.countries.find((c) => c.name === n)?.key).toBeNull();
  });
});

describe("formatting", () => {
  it("money", () => {
    expect(formatAidMoney(6_752_933_185)).toBe("$6.8B");
    expect(formatAidMoney(450_000_000)).toBe("$450M");
    expect(formatAidMoney(4_300_000)).toBe("$4.3M");
    expect(formatAidMoney(-1_200_000)).toBe("−$1.2M");
    expect(formatAidMoney(1_200_000, true)).toBe("+$1.2M");
    expect(formatAidAxis(20e9)).toBe("$20B");
    expect(formatAidAxis(2.5e6)).toBe("$2.5M");
  });
  it("ticks adapt from billions to thousands", () => {
    const b = niceDollarTicks(71_550_094_693);
    expect(b.top).toBeGreaterThanOrEqual(71_550_094_693);
    const k = niceDollarTicks(80_000);
    expect(k.top).toBeGreaterThanOrEqual(80_000);
    expect(k.top).toBeLessThan(200_000);
  });
});

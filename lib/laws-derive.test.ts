import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { administration } from "./executive-orders-entities";
import { congressControlFile } from "./congress-control";
import {
  ALL_GROUPS,
  OTHER_GROUPS,
  ALL_ROW,
  administrationOn,
  buildLawsList,
  decadeCells,
  decadesOf,
  filterLaws,
  groupRows,
  heatCount,
  matchLaws,
  tallyText,
  buildLawsPayload,
  cellFor,
  filterGroups,
  groupCountsByCongress,
  noVoteShare,
  openYear,
  presidentTerms,
  seriesOf,
  signedMostByCongress,
  signedMostSegments,
  totalsByCongress,
  windowIndexes,
  yearSpan,
} from "./laws-derive";
import { lawCommitteesFile, lawCountRow, lawRow, lawsMeta } from "./laws-entities";
import { HISTORICAL_ADMINISTRATIONS } from "./troops-presidents";

const read = (f: string): unknown => JSON.parse(readFileSync(`pipeline/output/${f}`, "utf8"));
const counts = z.array(lawCountRow).parse(read("laws_counts.json"));
const laws = z.array(lawRow).parse(read("laws.json"));
const meta = lawsMeta.parse(read("laws_meta.json"));
const admins = [...HISTORICAL_ADMINISTRATIONS, ...z.array(administration).parse(read("administrations.json"))];

describe("the committed Laws files", () => {
  const totals = totalsByCongress(counts);
  it("hit the anchors: 651 laws in the 93rd, 274 in the 118th", () => {
    expect(totals.get(93)).toBe(651);
    expect(totals.get(118)).toBe(274);
  });
  it("start at the 93rd and run without a gap to the latest Congress", () => {
    expect(meta.first_congress).toBe(93);
    for (let c = 93; c <= meta.last_congress; c++) expect(totals.get(c), `Congress ${c}`).toBeGreaterThan(0);
  });
  it("flag only the Congress in progress as partial", () => {
    expect(meta.partial_congresses).toEqual([meta.last_congress]);
    expect(meta.last_congress).toBeGreaterThanOrEqual(119);
  });
  it("count every law exactly once", () => {
    expect([...totals.values()].reduce((a, b) => a + b, 0)).toBe(laws.length);
    expect(laws.length).toBe(meta.law_count);
  });
  it("list the 32 current CRS areas, the retired one, and Not classified", () => {
    expect(meta.areas.filter((a) => a.status === "current")).toHaveLength(32);
    expect(meta.areas.filter((a) => a.status === "retired").map((a) => a.name)).toEqual(["Commemorations"]);
    expect(meta.areas.at(-1)).toMatchObject({ id: "not-classified", status: "none" });
  });
  it("give every area a topic group, and about ten groups plus Not classified", () => {
    const groups = new Set(meta.groups.map((g) => g.id));
    for (const a of meta.areas) expect(groups.has(a.group), a.id).toBe(true);
    expect(meta.groups.length).toBeGreaterThanOrEqual(10);
    expect(meta.groups.length).toBeLessThanOrEqual(12);
  });
  it("count Commemorations in every Congress, not only the years CRS used its own label", () => {
    const comm = new Map(counts.filter((c) => c.area_id === "commemorations").map((c) => [c.congress, c.n]));
    for (let c = 93; c <= meta.last_congress; c++) expect(comm.get(c), `Congress ${c}`).toBeGreaterThan(0);
  });
  it("keep the CRS area of every law the commemorative flag moved", () => {
    const moved = laws.filter((l) => l.crs_area_id !== undefined);
    expect(moved.length).toBeGreaterThan(1000);
    for (const l of moved) {
      expect(l.area_id).toBe("commemorations");
      expect(l.crs_area_id).not.toBe("commemorations");
      expect(meta.areas.some((a) => a.id === l.crs_area_id), l.law_id).toBe(true);
    }
  });
  it("date every law inside its Congress or by 20 January after it", () => {
    for (const l of laws) {
      const start = 1789 + 2 * (l.congress - 1);
      expect(l.date >= `${start}-01-03` && l.date <= `${start + 2}-01-20`, l.law_id).toBe(true);
    }
  });
  it("number the laws of each finished Congress 1..N", () => {
    const by = new Map<number, number[]>();
    for (const l of laws) by.set(l.congress, [...(by.get(l.congress) ?? []), l.number]);
    for (const [c, nums] of by) if (!meta.partial_congresses.includes(c)) expect(nums.slice().sort((a, b) => a - b), `Congress ${c}`).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1));
  });
  it("record the known veto overrides", () => {
    const ids = new Set(laws.filter((l) => l.veto_override).map((l) => l.law_id));
    for (const id of ["93-pub-148" /* War Powers Resolution */, "114-pub-222" /* Justice Against Sponsors of Terrorism Act */, "116-pub-283" /* FY2021 NDAA */]) expect(ids.has(id), id).toBe(true);
    expect(ids.has("118-pub-90")).toBe(false);
  });
});

describe("passage votes and support bands", () => {
  const byId = new Map(laws.map((l) => [l.law_id, l]));
  it("record the known tallies", () => {
    expect(byId.get("111-pub-148")).toMatchObject({ house: [0, 219, 212, 165], senate: [0, 60, 39, 396], band: 1 }); // Affordable Care Act
    expect(byId.get("99-pub-514")).toMatchObject({ house: [0, 292, 136, 413], senate: [0, 74, 23, 296], band: 2 }); // Tax Reform Act of 1986
    expect(byId.get("107-pub-56")).toMatchObject({ house: [0, 357, 66, 398], senate: [0, 98, 1, 313], band: 3 }); // USA PATRIOT Act
    expect(byId.get("117-pub-169")).toMatchObject({ house: [0, 220, 207, 420], senate: [0, 51, 50, 325], band: 1 }); // Inflation Reduction Act
  });
  it("keep the override votes apart from the passage band", () => {
    expect(byId.get("93-pub-148")).toMatchObject({ house: [0, 238, 123, 520], override_votes: [284, 135, 75, 18], band: 2, veto_override: true }); // War Powers Resolution
    for (const l of laws.filter((x) => x.veto_override)) expect(l.override_votes?.every((n) => n !== null), l.law_id).toBe(true);
    for (const l of laws.filter((x) => !x.veto_override)) expect(l.override_votes, l.law_id).toBeNull();
  });
  it("give a roll-call vote a tally and a roll number, and any other kind neither", () => {
    for (const l of laws) for (const v of [l.house, l.senate]) {
      if (v[0] === 0) expect(v[1] !== null && v[2] !== null && v[1] + v[2] > 0, l.law_id).toBe(true);
      else expect(v.slice(1), l.law_id).toEqual([null, null, null]);
    }
  });
  it("set each law's band from the narrowest recorded yes share", () => {
    for (const l of laws) {
      const shares = [l.house, l.senate].flatMap((v) => (v[0] === 0 ? [v[1]! / (v[1]! + v[2]!)] : []));
      const expected = shares.length === 0 ? 0 : (() => { const m = Math.min(...shares); return m < 0.6 ? 1 : m < 0.75 ? 2 : m < 0.9 ? 3 : 4; })();
      expect(l.band, l.law_id).toBe(expected);
    }
  });
  it("add the band counts up to the law counts, in every row and in the payload", () => {
    for (const c of counts) expect(c.bands.reduce((a, b) => a + b, 0)).toBe(c.n);
    const p = buildLawsPayload(counts, laws, meta, admins);
    for (let i = 0; i < p.congresses.length; i++) for (let j = 0; j < p.areas.length; j++) expect(p.bands[i]![j]!.reduce((a, b) => a + b, 0)).toBe(p.counts[i]![j]);
  });
  it("show most laws passed by voice vote or consent before 2000, as the pre-flight found", () => {
    const share = (from: number, to: number) => {
      const ls = laws.filter((l) => l.congress >= from && l.congress <= to);
      return ls.filter((l) => l.band === 0).length / ls.length;
    };
    expect(share(93, 106)).toBeGreaterThan(0.6);
    expect(share(116, 118)).toBeLessThan(0.7);
  });
  it("start the support card at the first Congress and record Voteview's last roll call", () => {
    expect(meta.support_first_congress).toBe(93);
    expect(meta.voteview_last_date.House >= "2025-01-03").toBe(true);
  });
});

describe("major laws and summaries", () => {
  const major = JSON.parse(readFileSync("pipeline/output/laws_major.json", "utf8")) as { entries: Record<string, { title: string }>; laws: Record<string, [string, number, number][]> };
  it("flag Mayhew's laws as major, the rest as not major, and the Congress after his last list as not yet assessed", () => {
    const by = new Map(laws.map((l) => [l.law_id, l]));
    expect(meta.major_covered_through_congress).toBe(118);
    for (const l of laws) expect(l.major, l.law_id).toBe(l.congress > 118 ? null : l.law_id in major.laws);
    expect(by.get("111-pub-148")!.major).toBe(true); // Affordable Care Act
    expect(by.get("93-pub-148")!.major).toBe(true); // War Powers Resolution
    expect(by.get("117-pub-169")!.major).toBe(true); // Inflation Reduction Act
    expect(by.get("119-pub-21")!.major).toBeNull(); // 2025 reconciliation law: no Mayhew list for the 119th yet
    expect(by.get("94-pub-1")!.major).toBe(false);
  });
  it("give every Congress some major laws and keep the counts in step", () => {
    const perCongress = new Map<number, number>();
    for (const c of counts) perCongress.set(c.congress, (perCongress.get(c.congress) ?? 0) + c.major);
    for (let c = 93; c <= 118; c++) expect(perCongress.get(c), `Congress ${c}`).toBeGreaterThan(0);
    expect(perCongress.get(119)).toBe(0);
    expect([...perCongress.values()].reduce((a, b) => a + b, 0)).toBe(Object.keys(major.laws).length);
  });
  it("name an entry for every major law", () => {
    for (const refs of Object.values(major.laws)) for (const [id] of refs) expect(major.entries[id], id).toBeDefined();
  });
  it("carry a clean first sentence of 40-300 characters or none", () => {
    let with_ = 0;
    for (const l of laws) {
      if (l.summary === undefined) continue;
      with_++;
      expect(l.summary.length >= 40 && l.summary.length <= 300, l.law_id).toBe(true);
      expect(l.summary, l.law_id).toMatch(/^["“‘(]?[A-Z0-9]/);
      expect(l.summary, l.law_id).toMatch(/[.!?]["”')\]]*$/);
    }
    expect(with_).toBeGreaterThan(laws.length * 0.6);
  });
});

describe("Not classified and committees", () => {
  it("leaves laws without a CRS area only in the 93rd-95th Congresses", () => {
    const nc = counts.filter((c) => c.area_id === "not-classified");
    expect(nc.length).toBeGreaterThan(0);
    expect(Math.max(...nc.map((c) => c.congress))).toBeLessThanOrEqual(95);
  });
  const committees = lawCommitteesFile.parse(read("laws_committees.json"));
  it("links a law to its committees and subcommittees", () => {
    const hr815 = committees.laws["118-pub-50"]!;
    expect(hr815.find(([id]) => id === "HSVR")?.[1]).toEqual(["HSVR03"]);
    expect(committees.committees.HSVR).toMatchObject({ chamber: "House", page: true });
    expect(committees.committees.HSVR03).toMatchObject({ parent: "HSVR", page: true });
  });
  it("names every id a law uses", () => {
    for (const entries of Object.values(committees.laws)) for (const [id, subs] of entries) for (const k of [id, ...subs]) expect(committees.committees[k], k).toBeDefined();
  });
  it("only ever flags a page for a committee id of the current Congress", () => {
    const current = new Set((read("committees.json") as { committee_id: string }[]).map((c) => c.committee_id));
    for (const [id, c] of Object.entries(committees.committees)) if (c.parent === null && c.page) expect(current.has(id), id).toBe(true);
  });
});

describe("administrationOn", () => {
  it("finds the president on the day, including inauguration day", () => {
    expect(administrationOn("2021-01-20", admins)?.president).toBe("Joe Biden");
    expect(administrationOn("2021-01-19", admins)?.president).toBe("Donald Trump");
    expect(administrationOn("1974-08-09", admins)?.president).toBe("Gerald Ford");
    expect(administrationOn("1974-08-08", admins)?.president).toBe("Richard Nixon");
  });
});

describe("signedMostByCongress", () => {
  const signed = signedMostByCongress(laws, admins);
  it("names the president who signed most", () => {
    expect(signed.get(111)?.president).toBe("Barack Obama");
    expect(signed.get(115)?.president).toBe("Donald Trump");
    expect(signed.get(117)?.president).toBe("Joe Biden");
    expect(signed.get(97)?.president).toBe("Ronald Reagan");
  });
  it("splits the 93rd between Nixon and Ford and keeps the laws summing", () => {
    const s = signed.get(93)!;
    expect(s.split.map((x) => x.president).sort()).toEqual(["Gerald Ford", "Richard Nixon"]);
    expect(s.split.reduce((a, b) => a + b.n, 0)).toBe(651);
    expect(s.n).toBe(Math.max(...s.split.map((x) => x.n)));
  });
  it("counts every law once, in every Congress", () => {
    const totals = totalsByCongress(counts);
    for (const [c, s] of signed) expect(s.split.reduce((a, b) => a + b.n, 0), `Congress ${c}`).toBe(totals.get(c));
  });
  it("agrees with a plain recount from the dates", () => {
    const by = new Map<number, Map<string, number>>();
    for (const l of laws) {
      const a = admins.find((x) => x.start <= l.date && (x.end === null || l.date <= x.end))!;
      const m = by.get(l.congress) ?? new Map();
      m.set(a.term_id, (m.get(a.term_id) ?? 0) + 1);
      by.set(l.congress, m);
    }
    for (const [c, m] of by) expect(signed.get(c)!.n, `Congress ${c}`).toBe(Math.max(...m.values()));
  });
  it("splits a Congress that straddles an inauguration", () => {
    expect(signed.get(101)!.split.length).toBeGreaterThanOrEqual(1);
    expect(signed.get(107)!.president).toBe("George W. Bush");
  });
  it("throws for a law no administration covers", () => {
    expect(() => signedMostByCongress([{ congress: 1, date: "1800-01-01", law_id: "x" }], admins)).toThrow("no administration");
  });
});

describe("groupCountsByCongress and buildLawsPayload", () => {
  it("group counts add back to the Congress totals", () => {
    const totals = totalsByCongress(counts);
    for (const [c, per] of groupCountsByCongress(counts, meta)) expect([...per.values()].reduce((a, b) => a + b, 0)).toBe(totals.get(c));
  });
  it("builds a dense payload that matches the counts", () => {
    const p = buildLawsPayload(counts, laws, meta, admins);
    expect(p.majorThrough).toBe(118);
    expect(p.major.flat().reduce((a, b) => a + b, 0)).toBe(laws.filter((l) => l.major).length);
    expect(p.congresses[0]).toBe(93);
    expect(p.counts.map((row) => row.reduce((a, b) => a + b, 0))[0]).toBe(651);
    expect(p.signedMost).toHaveLength(p.congresses.length);
    expect(p.partial.at(-1)).toBe(true);
    expect(p.lawCount).toBe(laws.length);
  });
});

describe("the Laws page derivations (over the committed files)", () => {
  const control = congressControlFile.parse(JSON.parse(readFileSync("pipeline/reference/congress-control.json", "utf8")));
  const p = buildLawsPayload(counts, laws, meta, admins, control.rows);
  const all = filterGroups(p, ALL_GROUPS);

  it("opens the 93rd in 1973 and spans 1973 to the second year of the latest Congress", () => {
    expect(openYear(93)).toBe(1973);
    expect(yearSpan(p)).toEqual([1973, openYear(p.congresses.at(-1)!) + 1]);
  });
  it("splits every cell's laws into bands, and the major ones into bands that add up to the major count", () => {
    p.congresses.forEach((_, ci) => {
      p.areas.forEach((_a, ai) => {
        expect(p.bands[ci]![ai]!.reduce((a, b) => a + b, 0)).toBe(p.counts[ci]![ai]);
        expect(p.majorBands[ci]![ai]!.reduce((a, b) => a + b, 0)).toBe(p.major[ci]![ai]);
      });
    });
  });
  it("reads the anchors back through cellFor: 651 laws in the 93rd, 274 in the 118th", () => {
    expect(cellFor(p, 0, all, false).n).toBe(651);
    expect(cellFor(p, p.congresses.indexOf(118), all, false).n).toBe(274);
  });
  it("has major laws only through the last assessed Congress", () => {
    const after = p.congresses.map((c, ci) => (c > p.majorThrough ? cellFor(p, ci, all, true).n : 0));
    expect(after.every((n) => n === 0)).toBe(true);
    expect(cellFor(p, 0, all, true).n).toBeGreaterThan(0);
  });
  it("draws seven series: five coloured groups, Other topics and Not classified, covering every group once", () => {
    const s = seriesOf(p);
    expect(s).toHaveLength(7);
    expect(s.at(-1)!.id).toBe("not-classified");
    expect(s.flatMap((x) => x.groups).sort()).toEqual(p.groups.map((g) => g.id).sort());
    const other = filterGroups(p, OTHER_GROUPS)!;
    expect([...other].sort()).toEqual([...s.find((x) => x.id === OTHER_GROUPS)!.groups].sort());
  });
  it("sums the series back to each Congress's total", () => {
    const s = seriesOf(p);
    for (const ci of [0, 10, p.congresses.length - 1]) {
      const sum = s.reduce((t, x) => t + cellFor(p, ci, new Set(x.groups), false).n, 0);
      expect(sum).toBe(cellFor(p, ci, all, false).n);
    }
  });
  it("shows every Congress for the full span, and the Congresses a president's term held for a term", () => {
    expect(windowIndexes(p, yearSpan(p), false)).toEqual([0, p.congresses.length - 1]);
    const span = (from: number, to: number) => {
      const [a, b] = windowIndexes(p, [from, to], false);
      return [p.congresses[a], p.congresses[b]];
    };
    expect(span(2017, 2021)).toEqual([115, 116]);
    expect(span(2021, 2025)).toEqual([117, 118]);
    expect(span(2009, 2017)).toEqual([111, 114]);
    expect(span(1981, 1989)).toEqual([97, 100]);
  });
  it("never leaves a window of two or more years empty, and stops at the last assessed Congress for major laws", () => {
    const [lo, hi] = yearSpan(p);
    for (let y = lo; y < hi; y++) {
      const [a, b] = windowIndexes(p, [y, y + 1], false);
      expect(b, `${y}`).toBeGreaterThanOrEqual(a);
    }
    const [, b] = windowIndexes(p, yearSpan(p), true);
    expect(p.congresses[b]).toBe(p.majorThrough);
  });
  it("lists the presidents from Nixon to the sitting one, once each in a row", () => {
    const t = presidentTerms(admins, 1973, yearSpan(p)[1]);
    expect(t[0]).toMatchObject({ last: "Nixon", from: 1973, to: 1974 });
    expect(t.map((x) => x.last).slice(0, 4)).toEqual(["Nixon", "Ford", "Carter", "Reagan"]);
    expect(t.at(-1)!.to).toBe(yearSpan(p)[1]);
    expect(new Set(t.map((x) => x.id)).size).toBe(t.length);
  });
  it("labels each Congress's bar with who signed most of its laws, merging runs", () => {
    const segs = signedMostSegments(p, p.congresses.map((_, i) => i));
    expect(segs.reduce((n, s) => n + s.e - s.s + 1, 0)).toBe(p.congresses.length);
    expect(segs[0]).toMatchObject({ last: "Nixon", s: 0 });
  });
  it("reads party control for every Congress in both chambers (Democrats held the 93rd, Republicans the 104th House)", () => {
    expect(p.control.house).toHaveLength(p.congresses.length);
    expect(p.control.senate).toHaveLength(p.congresses.length);
    expect(p.control.house[0]).toBe("D");
    expect(p.control.house[p.congresses.indexOf(104)]).toBe("R");
  });
  it("finds most pre-2000 laws passed by voice vote or consent, and far fewer after", () => {
    expect(noVoteShare(p, 93, 106)).toBeGreaterThan(0.5);
    expect(noVoteShare(p, 107, 118)).toBeLessThan(noVoteShare(p, 93, 106));
  });
});

describe("the list of every law and card 3", () => {
  const p = buildLawsPayload(counts, laws, meta, admins);
  const sponsors = (id: string): [string, string, "D" | "R" | "I", string | null] => [`Rep. ${id}`, "D-XX", "D", null];
  const list = buildLawsList(laws, meta, admins, (id) => sponsors(id));
  const all = (): [number, number] => [0, p.congresses.length - 1];
  const filt = { window: all(), congress: null, group: "", major: false, band: null } as const;

  it("carries every law once, newest first", () => {
    expect(list.rows).toHaveLength(laws.length);
    expect(new Set(list.rows.map((r) => `${r[0]}-${r[1]}`)).size).toBe(laws.length);
    for (let i = 1; i < list.rows.length; i++) expect(list.rows[i - 1]![2] >= list.rows[i]![2]).toBe(true);
  });
  it("derives the signer from the date and the bill label from the type", () => {
    const row = (id: string) => list.rows.find((r) => `${r[0]}-${r[1]}` === id.replace("-pub-", "-"))!;
    expect(list.signers[row("111-pub-148")[13]]![0]).toBe("Barack Obama");
    expect(row("111-pub-148")[12]).toBe("H.R. 3590");
    expect(list.signers[row("93-pub-148")[13]]![0]).toBe("Richard Nixon"); // vetoed by Nixon, signed by none: dated by the override
    expect(row("93-pub-148")[10]).toBe(1);
  });
  it("keeps three major states", () => {
    const ms = new Set(list.rows.map((r) => r[9]));
    expect([...ms].sort()).toEqual([0, 1, 2]);
    for (const r of list.rows) expect(r[9] === 2).toBe(r[0] > p.majorThrough);
  });
  it("counts the same laws as the charts under any filter", () => {
    expect(filterLaws(p, list.rows, filt)).toHaveLength(laws.length);
    const fromCharts = (group: string, major: boolean, band: number | null, a: number, b: number) => {
      let n = 0;
      for (let ci = a; ci <= b; ci++) {
        const c = cellFor(p, ci, filterGroups(p, group), major);
        n += band === null ? c.n : c.bands[band]!;
      }
      return n;
    };
    for (const [group, major, band] of [["", true, null], ["", false, 1], [seriesOf(p)[0]!.groups[0]!, false, null], ["other", true, 0]] as const) {
      const w = windowIndexes(p, [1990, 2010], major);
      expect(filterLaws(p, list.rows, { window: w, congress: null, group, major, band }), `${group}/${major}/${band}`).toHaveLength(fromCharts(group, major, band, w[0], w[1]));
    }
    expect(filterLaws(p, list.rows, { ...filt, congress: 93 })).toHaveLength(651);
    expect(filterLaws(p, list.rows, { ...filt, congress: 118 })).toHaveLength(274);
  });
  it("searches every word across name, bill, sponsor, area and Pub. L. number", () => {
    expect(matchLaws(p, list, list.rows, "").length).toBe(laws.length);
    const hit = matchLaws(p, list, list.rows, "H.R. 3590 patient protection");
    expect(hit.map((r) => `${r[0]}-${r[1]}`)).toContain("111-148");
    expect(matchLaws(p, list, list.rows, "111-148").length).toBeGreaterThanOrEqual(1);
    expect(matchLaws(p, list, list.rows, "zzzz nonexistent")).toHaveLength(0);
  });
  it("words each passage the way the page says it", () => {
    expect(tallyText("Senate", [0, 60, 39])).toBe("Senate 60\u201339");
    expect(tallyText("House", [1, null, null])).toBe("House voice vote");
    expect(tallyText("House", [2, null, null])).toBe("House unanimous consent");
    expect(tallyText("House", [3, null, null])).toContain("no method stated");
  });
  it("builds card 3's rows: All first, every group, bands summing to the total", () => {
    const rows = groupRows(p, all(), false, { key: "n", reversed: false });
    expect(rows[0]).toMatchObject({ id: ALL_ROW, total: laws.length });
    expect(rows.slice(1).reduce((n, r) => n + r.total, 0)).toBe(laws.length);
    for (const r of rows) expect(r.bands.reduce((a, b) => a + b, 0)).toBe(r.total);
    const sizes = rows.slice(1).map((r) => r.total);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    const rev = groupRows(p, all(), false, { key: "n", reversed: true });
    expect(rev.slice(1).map((r) => r.id)).toEqual(rows.slice(1).map((r) => r.id).reverse());
    expect(rows.some((r) => r.id === "not-classified")).toBe(true);
  });
  it("orders card 3 by the share on a narrow vote or by voice vote or consent", () => {
    for (const [key, band] of [["f", 1], ["u", 0]] as const) {
      const rows = groupRows(p, all(), false, { key, reversed: false }).slice(1);
      const shares = rows.map((r) => r.bands[band]! / r.total);
      expect([...shares].sort((a, b) => b - a)).toEqual(shares);
    }
  });
  it("shades the heatmap by decade, every Congress counted once", () => {
    expect(decadesOf(p)).toEqual([1970, 1980, 1990, 2000, 2010, 2020]);
    const cells = decadeCells(p, ALL_ROW, false);
    expect(cells.reduce((n, c) => n + c.total, 0)).toBe(laws.length);
    expect(cells[0]!.total).toBe(totalsByCongress(counts).get(93)! + totalsByCongress(counts).get(94)! + totalsByCongress(counts).get(95)! + totalsByCongress(counts).get(96)!);
    expect(heatCount(cells[0]!, 0)).toBeLessThanOrEqual(cells[0]!.total);
    const major = decadeCells(p, ALL_ROW, true);
    expect(major.reduce((n, c) => n + c.total, 0)).toBe(laws.filter((l) => l.major === true).length);
  });
});

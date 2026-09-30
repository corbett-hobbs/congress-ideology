import { describe, expect, it } from "vitest";
import { loadRealProfiles } from "./court-test-data";
import {
  confirmedLine,
  elevatedLine,
  fitIntervalDomain,
  presidentDisplay,
  servedLine,
  yearSpan,
} from "./justice-derive";
import { justicePath, justiceSlug } from "./justice-url";

const { payload, profiles } = loadRealProfiles();
const p = (last: string) => {
  const f = profiles.find((x) => x.justice.name.endsWith(last));
  if (!f) throw new Error(`no profile for ${last}`);
  return f;
};

describe("formatting", () => {
  it("collapses a one-year span", () => {
    expect(yearSpan(2009, 2009)).toBe("2009");
    expect(yearSpan(1975, 2009)).toBe("1975–2009");
    expect(yearSpan(2009, "present")).toBe("2009–present");
  });

  it("writes the served line, marking service cut off by the data", () => {
    const full = { appointment_start: "1975-12-17", service_end: "2010-06-30" };
    expect(servedLine(full, 35, 1937)).toBe("Served 1975–2010 · 35 terms");
    expect(servedLine({ ...full, service_end: null }, 1, 1937)).toBe("Served 1975–present · 1 term");
    expect(servedLine({ appointment_start: "1916-06-01", service_end: "1939-02-13" }, 2, 1937)).toBe(
      "Served 1916–1939 · 2 terms in the data",
    );
    // Seated in August 1937, before any scored term: the data has all of his terms.
    expect(servedLine({ appointment_start: "1937-08-19", service_end: "1971-09-17" }, 34, 1937)).not.toMatch(/in the data/);
  });

  it("writes the confirmation line", () => {
    expect(confirmedLine({ senate_vote: { ayes: 98, nays: 0 } })).toBe("Confirmed 98–0");
    expect(confirmedLine({ senate_vote: null })).toBe("Confirmed by voice vote");
  });

  it("only writes an elevation line when the Chief Justice appointment is a different one", () => {
    expect(elevatedLine({ confirmation_date: "1971-12-10", chief_justice_appointment: null })).toBeNull();
    const chief = { president: "Ronald Reagan", party: "Republican" as const, nomination_date: null, confirmation_date: "1986-09-17", start_date: "1986-09-26" };
    expect(elevatedLine({ confirmation_date: "1971-12-10", chief_justice_appointment: chief })).toBe(
      "Elevated to Chief Justice by Ronald Reagan, 1986",
    );
    expect(elevatedLine({ confirmation_date: "1986-09-17", chief_justice_appointment: chief })).toBeNull();
  });

  it("normalises the FJC president spelling", () => {
    expect(presidentDisplay("Harry S Truman")).toBe("Harry S. Truman");
  });

  it("builds slugged URLs", () => {
    expect(justicePath({ id: 103, name: "John Stevens" })).toBe("/supreme-court/justices/103/john-stevens");
    expect(justiceSlug({ name: "Sandra O'Connor" })).toBe("sandra-oconnor");
  });
});

describe("every justice", () => {
  it("gets a profile", () => {
    expect(profiles).toHaveLength(payload.justices.length);
    expect(profiles).toHaveLength(49);
  });

  it("shares one score domain that contains every score and interval bound", () => {
    const domains = new Set(profiles.map((x) => x.chart.domain.join(",")));
    expect(domains.size).toBe(1);
    const [lo, hi] = profiles[0].chart.domain;
    for (const j of payload.justices) {
      expect(Math.min(...j.lo)).toBeGreaterThanOrEqual(lo);
      expect(Math.max(...j.hi)).toBeLessThanOrEqual(hi);
    }
    expect(fitIntervalDomain([{ mq_lo95: -1, mq_hi95: 1 } as never])).toEqual([-1.5, 1.5]);
  });

  it("clips every peer trace to the shared terms, inside both tenures", () => {
    for (const x of profiles) {
      for (const peer of x.chart.peers) {
        const full = payload.justices.find((j) => j.id === peer.id)!;
        expect(peer.t0).toBeGreaterThanOrEqual(Math.max(x.justice.t0, full.t0));
        expect(peer.t1).toBeLessThanOrEqual(Math.min(x.justice.t1, full.t1));
        expect(peer.s).toHaveLength(peer.t1 - peer.t0 + 1);
        expect(peer.s[0]).toBe(full.s[peer.t0 - full.t0]);
      }
    }
  });

  it("lists peers symmetrically: A overlaps B iff B overlaps A", () => {
    for (const x of profiles) {
      for (const peer of x.chart.peers) {
        const other = profiles.find((q) => q.justice.id === peer.id)!;
        expect(other.chart.peers.some((q) => q.id === x.justice.id)).toBe(true);
      }
    }
  });

  it("finds four neighbors, never the subject, closest career average first", () => {
    for (const x of profiles) {
      expect(x.roster.neighbors).toHaveLength(4);
      expect(x.roster.neighbors.some((r) => r.id === x.justice.id)).toBe(false);
      const gaps = x.roster.neighbors.map((r) => Math.abs(r.career - x.justice.career));
      expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
      // Nobody outside the four is closer than the farthest neighbor.
      const far = Math.max(...gaps);
      const ids = new Set(x.roster.neighbors.map((r) => r.id));
      for (const j of payload.justices) {
        if (j.id === x.justice.id || ids.has(j.id)) continue;
        expect(Math.abs(j.career - x.justice.career)).toBeGreaterThanOrEqual(far - 1e-9);
      }
    }
  });

  it("sorts the served-alongside roster by career-average gap", () => {
    for (const x of profiles) {
      const gaps = x.roster.alongside.map((r) => Math.abs(r.career - x.justice.career));
      expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
      expect(x.roster.alongside).toHaveLength(x.chart.peers.length);
    }
  });

  it("computes the career average as the unweighted term mean", () => {
    for (const j of payload.justices) {
      const mean = j.s.reduce((a, b) => a + b, 0) / j.s.length;
      expect(Math.abs(j.career - mean)).toBeLessThanOrEqual(0.0005 + 1e-9);
    }
  });

  it("puts the swarm range at the subject's own min and max", () => {
    for (const x of profiles) {
      expect(x.swarm.range.min).toBe(Math.min(...x.justice.s));
      expect(x.swarm.range.max).toBe(Math.max(...x.justice.s));
      expect(x.swarm.points).toHaveLength(49);
    }
  });
});

describe("specific justices", () => {
  it("Stevens: long tenure, 98–0, Ford", () => {
    const s = p("Stevens");
    expect(s.identity).toMatchObject({
      role: "Associate Justice",
      appointedBy: { president: "Gerald Ford", party: "R" },
      served: "Served 1975–2010 · 35 terms",
      confirmed: "Confirmed 98–0",
      elevated: null,
    });
    expect(s.chart.subtitle).toBe(`Stevens and the ${s.chart.peers.length} justices who overlapped with Stevens, 1975–2009`);
    expect(s.bio?.url).toContain("wikipedia.org");
    expect(s.photoSrc).toMatch(/^\/images\/justices\//);
  });

  it("Thomas: sitting, open-ended", () => {
    const t = p("Thomas");
    expect(t.chart.sitting).toBe(true);
    expect(t.identity.served).toMatch(/^Served 1991–present · \d+ terms$/);
    expect(t.chart.subtitle).toMatch(/1991–present$/);
    expect(t.roster.alongside.some((r) => r.tenure.endsWith("present"))).toBe(true);
  });

  it("Byrnes: a one-term justice still has a full profile", () => {
    const b = p("Byrnes");
    expect(b.justice.s).toHaveLength(1);
    expect(b.identity.served).toBe("Served 1941–1942 · 1 term");
    expect(b.identity.confirmed).toBe("Confirmed by voice vote");
    expect(b.chart.peers.every((q) => q.t0 === b.justice.t0 && q.t1 === b.justice.t1)).toBe(true);
  });

  it("Brandeis: service that began before the data says so", () => {
    expect(p("Brandeis").identity.served).toBe("Served 1916–1939 · 2 terms in the data");
  });

  it("Rehnquist: highest role Chief Justice, original president, elevation line", () => {
    const r = p("Rehnquist");
    expect(r.identity.role).toBe("Chief Justice");
    expect(r.identity.appointedBy.president).toBe("Richard M. Nixon");
    expect(r.identity.elevated).toBe("Elevated to Chief Justice by Ronald Reagan, 1986");
  });

  it("Hughes, appointed straight to Chief at his first scored term, has no elevation line", () => {
    expect(p("Hughes").identity.elevated).toBeNull();
  });

  it("disambiguates the two Roberts and two Jacksons in headings", () => {
    const lasts = profiles.filter((x) => /Roberts|Jackson/.test(x.justice.name)).map((x) => x.last);
    expect(new Set(lasts).size).toBe(lasts.length);
  });
});

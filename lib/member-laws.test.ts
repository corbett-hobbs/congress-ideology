import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { administration } from "./executive-orders-entities";
import { buildLawsList } from "./laws-derive";
import { lawCosponsorsFile, lawRow, lawsMeta } from "./laws-entities";
import { buildMemberLaws, indexMemberRoles, lawIdOf } from "./member-laws";
import { HISTORICAL_ADMINISTRATIONS } from "./troops-presidents";

const read = (f: string): unknown => JSON.parse(readFileSync(`pipeline/output/${f}`, "utf8"));
const laws = z.array(lawRow).parse(read("laws.json"));
const meta = lawsMeta.parse(read("laws_meta.json"));
const cosponsors = lawCosponsorsFile.parse(read("laws_cosponsors.json"));
const admins = [...HISTORICAL_ADMINISTRATIONS, ...z.array(administration).parse(read("administrations.json"))];
const list = buildLawsList(laws, meta, admins, (id) => [`Rep. ${id}`, "D-XX", "D", null]);
const roles = indexMemberRoles(laws, cosponsors);

describe("member laws", () => {
  it("keeps exactly the member's laws, newest first, with re-indexed tables", () => {
    const [id, mine] = [...roles.entries()].sort((a, b) => b[1].size - a[1].size)[0]!;
    const m = buildMemberLaws(list, meta.areas, mine);
    expect(m.rows).toHaveLength(mine.size);
    expect(m.roles).toHaveLength(m.rows.length);
    expect(m.rows.map(lawIdOf).every((l) => mine.has(l))).toBe(true);
    expect(m.rows.map((r) => r[2])).toEqual([...m.rows.map((r) => r[2])].sort().reverse());
    m.rows.forEach((r, i) => {
      expect(m.roles[i]).toBe(mine.get(lawIdOf(r)));
      expect(m.signers[r[13]]).toBeDefined();
      if (r[8] >= 0) expect(m.sponsors[r[8]]).toBeDefined();
      expect(m.areas[r[4]]).toBeDefined();
    });
    expect(id).toMatch(/^[A-Z]\d{6}$/);
  });

  it("counts a sponsor once, as sponsor, even when also listed as a cosponsor", () => {
    const m = indexMemberRoles([{ law_id: "1-pub-1", sponsor_bioguide_id: "A000001" }], { "1-pub-1": ["A000001", "B000002"] });
    expect(m.get("A000001")!.get("1-pub-1")).toBe(1);
    expect(m.get("B000002")!.get("1-pub-1")).toBe(0);
  });

  it("returns an empty set for a member with no laws", () => {
    const m = buildMemberLaws(list, meta.areas, undefined);
    expect(m.rows).toEqual([]);
  });
});

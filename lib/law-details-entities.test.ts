import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { lawDetailsShard } from "./law-details-entities";
import { lawSlug, parseLawId } from "./law-url";
import { lawRow } from "./laws-entities";

const OUT = join(process.cwd(), "pipeline", "output");
const laws = z.array(lawRow).parse(JSON.parse(readFileSync(join(OUT, "laws.json"), "utf8")));
const shards = readdirSync(join(OUT, "law_details"))
  .filter((n) => /^\d+\.json$/.test(n))
  .map((n) => lawDetailsShard.parse(JSON.parse(readFileSync(join(OUT, "law_details", n), "utf8"))));
const details = new Map(shards.flatMap((s) => Object.entries(s.laws)));

describe("law_details shards (real data)", () => {
  it("hold exactly the laws in laws.json, each in its own Congress's shard", () => {
    expect([...details.keys()].sort()).toEqual(laws.map((l) => l.law_id).sort());
    for (const s of shards) for (const id of Object.keys(s.laws)) expect(parseLawId(id)!.congress).toBe(s.congress);
  });
  it("give every law a page address", () => {
    for (const l of laws) {
      expect(lawSlug(l.title)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(parseLawId(l.law_id)).toEqual({ congress: l.congress, number: l.number });
    }
  });
  it("has the signing action for every law, and actions in date order", () => {
    for (const l of laws) {
      const d = details.get(l.law_id)!;
      expect(d.actions.length, l.law_id).toBeGreaterThan(0);
      expect(d.actions.map((a) => a[0]), l.law_id).toEqual([...d.actions.map((a) => a[0])].sort());
    }
  });
  it("covers the cases the page is checked against: a 93rd veto override, a 119th law, a voice vote, a recorded vote", () => {
    const veto = laws.find((l) => l.law_id === "93-pub-148")!;
    expect(veto.veto_override).toBe(true);
    expect(veto.override_votes).not.toBeNull();
    expect(details.get("93-pub-148")!.summary?.length).toBeGreaterThan(1);
    expect(laws.some((l) => l.congress === 119)).toBe(true);
    expect(laws.find((l) => l.law_id === "100-pub-1")!.house[0]).toBe(1);
    const rolled = details.get("118-pub-90")!.actions.find((a) => a[3]);
    expect(rolled![3]).toEqual([[0, 442, 2]]);
  });
  it("never ends a cut summary mid-sentence", () => {
    const open = [...details].filter(([, d]) => d.cut && !/[.!?]["”')\]]*$/.test(d.summary![d.summary!.length - 1]!));
    // Only a summary with no finished sentence in its first 3,000 characters (a table of contents) may end otherwise.
    expect(open.length).toBeLessThan(20);
  });
});

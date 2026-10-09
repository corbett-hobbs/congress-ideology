import { describe, expect, it } from "vitest";
import { CongressApi, lawsFromApiBill } from "./congress-gov-lib";

const res = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe("CongressApi", () => {
  it("sends the key in a header, never in the URL, and retries a 429", async () => {
    const seen: { url: string; key: string | null }[] = [];
    const queue = [res(429, {}, { "retry-after": "1" }), res(200, { ok: true }, { "x-ratelimit-remaining": "19990" })];
    const slept: number[] = [];
    const api = new CongressApi({
      key: "SECRET",
      perSecond: 1000,
      sleep: async (ms) => void slept.push(ms),
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen.push({ url, key: new Headers(init.headers).get("x-api-key") });
        return queue.shift()!;
      }) as unknown as typeof fetch,
    });
    expect(await api.get("/law/118/pub", { limit: 1 })).toEqual({ ok: true });
    expect(seen.every((s) => !s.url.includes("SECRET") && s.key === "SECRET")).toBe(true);
    expect(slept).toContain(1000);
    expect(api.remaining).toBe(19990);
    expect(api.calls).toBe(2);
  });

  it("returns null on a 404 and throws on other errors", async () => {
    const mk = (status: number) => new CongressApi({ key: "k", perSecond: 1000, sleep: async () => {}, fetchImpl: (async () => res(status, {})) as unknown as typeof fetch });
    expect(await mk(404).get("/x")).toBeNull();
    await expect(mk(403).get("/x")).rejects.toThrow("403");
  });

  it("pages a list until the source stops", async () => {
    const pages = [
      { pagination: { count: 3, next: "more" }, bills: [{ n: 1 }, { n: 2 }] },
      { pagination: { count: 3 }, bills: [{ n: 3 }] },
    ];
    const api = new CongressApi({ key: "k", perSecond: 1000, sleep: async () => {}, fetchImpl: (async () => res(200, pages.shift())) as unknown as typeof fetch });
    const out = await api.list("/law/1/pub", "bills");
    expect(out.count).toBe(3);
    expect(out.items).toHaveLength(3);
  });
});

describe("lawsFromApiBill", () => {
  const bill = { number: "815", type: "HR", originChamber: "House", title: "Supplemental", introducedDate: "2023-02-02", updateDate: "2025-01-02T00:00:00Z", sponsors: [{ bioguideId: "M001159", fullName: "Rep. M" }], policyArea: { name: "Economics and Public Finance" }, laws: [{ number: "118-50", type: "Public Law" }, { number: "117-1", type: "Public Law" }], latestAction: { actionDate: "2024-04-24" } };
  const actions = [
    { actionDate: "2024-04-24", text: "Became Public Law No: 118-50.", type: "BecameLaw", sourceSystem: { code: 9 } },
    { actionDate: "2024-04-23", text: "Passed Senate by Yea-Nay Vote. 79 - 18.", type: "Floor", sourceSystem: { name: "Senate" }, recordedVotes: [{ chamber: "Senate", rollNumber: 154, sessionNumber: 2, date: "2024-04-24T01:44:19Z" }] },
    { actionDate: "2024-04-01", text: "Motion to reconsider laid on the table.", type: "Floor" },
  ];

  it("keeps only the laws of the requested Congress and slims the actions", () => {
    const laws = lawsFromApiBill(118, bill, actions, [], [{ bioguideId: "A000001" }, { bioguideId: "B000002", sponsorshipWithdrawnDate: "2024-01-01" }], [{ systemCode: "HSVR00", name: "Veterans' Affairs Committee", chamber: "House", activities: [{ name: "Referred To", date: "2023-02-02T14:30:25Z" }], subcommittees: [{ systemCode: "hsvr03", name: "Health Subcommittee", activities: [] }] }, { systemCode: "bogus", name: "x" }]);
    expect(laws.map((l) => l.law_id)).toEqual(["118-pub-50"]);
    const l = laws[0]!;
    expect(l.actions.map((a) => a.type)).toEqual(["Floor", "BecameLaw"]);
    expect(l.actions[0]!.votes).toEqual([{ chamber: "Senate", roll: 154, session: 2, date: "2024-04-24" }]);
    expect(l.became_law).toEqual(["2024-04-24"]);
    expect(l.cosponsors).toEqual(["A000001"]);
    expect(l.bill_type).toBe("hr");
    expect(l.updated).toBe("2025-01-02");
    expect(l.committees).toEqual([{ code: "hsvr00", name: "Veterans' Affairs Committee", chamber: "House", activities: [{ name: "Referred To", date: "2023-02-02" }], subcommittees: [{ code: "hsvr03", name: "Health Subcommittee", activities: [] }] }]);
  });

  it("rejects a bill type that cannot become law", () => {
    expect(() => lawsFromApiBill(118, { ...bill, type: "HRES" }, [], [], [], [])).toThrow("cannot become a public law");
  });
});

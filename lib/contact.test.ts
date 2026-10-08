import { describe, expect, it } from "vitest";
import {
  buildBody,
  buildSubject,
  createRateLimiter,
  LIMITS,
  parseContactBody,
  parsePagePath,
  parseTopic,
  stripControl,
  validEmail,
} from "./contact";

function ok(raw: unknown) {
  const r = parseContactBody(raw);
  if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
  return r.input;
}

describe("topic and page allowlists", () => {
  it("falls back to correction for unknown topics", () => {
    expect(parseTopic("question")).toBe("question");
    expect(parseTopic("sales")).toBe("correction");
    expect(parseTopic(undefined)).toBe("correction");
  });
  it("accepts only short paths that start with /", () => {
    expect(parsePagePath("/presidency/trade")).toBe("/presidency/trade");
    expect(parsePagePath("https://evil.example")).toBe("");
    expect(parsePagePath("/" + "a".repeat(LIMITS.page))).toBe("");
    expect(parsePagePath(5)).toBe("");
  });
});

describe("parseContactBody", () => {
  it("requires a message", () => {
    expect(parseContactBody({ topic: "idea", message: "   " }).kind).toBe("invalid");
    expect(parseContactBody(null).kind).toBe("invalid");
    expect(parseContactBody([]).kind).toBe("invalid");
  });
  it("rejects an over-long message", () => {
    expect(parseContactBody({ message: "x".repeat(LIMITS.message + 1) }).kind).toBe("invalid");
    expect(parseContactBody({ message: "x".repeat(LIMITS.message) }).kind).toBe("ok");
  });
  it("treats a filled honeypot as a silent drop", () => {
    expect(parseContactBody({ message: "hi", website: "http://spam" }).kind).toBe("honeypot");
  });
  it("caps page and expected, defaults topic, drops a bad email", () => {
    const i = ok({
      topic: "nope",
      message: " hi ",
      page: "p".repeat(500),
      expected: "e".repeat(5000),
      email: "not an email",
    });
    expect(i.topic).toBe("correction");
    expect(i.message).toBe("hi");
    expect(i.page.length).toBe(LIMITS.page);
    expect(i.expected.length).toBe(LIMITS.expected);
    expect(i.email).toBe("");
  });
  it("keeps a valid email", () => {
    expect(ok({ message: "hi", email: " a@b.org " }).email).toBe("a@b.org");
  });
});

describe("email check", () => {
  it("rejects header-injection attempts and junk", () => {
    expect(validEmail("a@b.org\r\nBcc: x@y.com")).toBe("");
    expect(validEmail("a@b")).toBe("");
    expect(validEmail("a b@c.org")).toBe("");
    expect(validEmail("x".repeat(LIMITS.email) + "@b.org")).toBe("");
  });
});

describe("subject and body", () => {
  it("strips CR/LF and control characters from the subject", () => {
    const i = ok({ topic: "correction", message: "m", page: "/a\r\nBcc: x@y.com\u0000" });
    const s = buildSubject(i);
    expect(s).not.toMatch(/[\r\n\u0000]/);
    expect(stripControl("a\r\nb\tc")).toBe("a b c");
  });
  it("builds the subject from the allowlisted topic only", () => {
    expect(buildSubject(ok({ topic: "evil\nSubject: x", message: "m" }))).toBe("InsideGov: Report a correction");
  });
  it("shows the expected field for corrections only", () => {
    expect(buildBody(ok({ topic: "correction", message: "m", expected: "Should be 5" }))).toContain("Should be 5");
    expect(buildBody(ok({ topic: "idea", message: "m", expected: "Should be 5" }))).not.toContain("Should be 5");
  });
});

describe("rate limiter", () => {
  it("allows max requests per window, then blocks, then recovers", () => {
    const allow = createRateLimiter(3, 1000);
    expect([allow("ip", 0), allow("ip", 1), allow("ip", 2), allow("ip", 3)]).toEqual([true, true, true, false]);
    expect(allow("other", 3)).toBe(true);
    expect(allow("ip", 1001)).toBe(true);
  });
});

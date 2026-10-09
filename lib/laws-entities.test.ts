import { describe, expect, it } from "vitest";
import { congressDateWindow, ordinal } from "./laws-entities";

describe("ordinal", () => {
  it.each([[93, "93rd"], [94, "94th"], [101, "101st"], [102, "102nd"], [103, "103rd"], [111, "111th"], [112, "112th"], [113, "113th"], [119, "119th"]])("%i -> %s", (n, s) => expect(ordinal(n)).toBe(s));
});

describe("congressDateWindow", () => {
  it("runs from 3 January of the first year to 20 January after the end", () => {
    expect(congressDateWindow(93)).toEqual({ start: "1973-01-03", end: "1975-01-20" });
    expect(congressDateWindow(119)).toEqual({ start: "2025-01-03", end: "2027-01-20" });
  });
});

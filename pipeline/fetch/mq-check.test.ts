import { describe, expect, it } from "vitest";
import {
  JUSTICES_HEADER,
  detectChallenge,
  latestReleaseYear,
  looksLikeCsv,
  releaseLabelFromReadme,
} from "./mq-check";

describe("detectChallenge", () => {
  it("flags the Cloudflare 403 and 'Just a moment...' bodies", () => {
    expect(detectChallenge(403, "text/html", "<html>")).toBe(true);
    expect(detectChallenge(200, "text/html", "<title>Just a moment...</title>")).toBe(true);
  });
  it("passes a normal CSV response", () => {
    expect(detectChallenge(200, "text/csv", '"term","justice"\n1937,67')).toBe(false);
  });
});

describe("looksLikeCsv", () => {
  it("accepts the expected header, with quotes and a BOM", () => {
    const header = JUSTICES_HEADER.map((c) => `"${c}"`).join(",");
    expect(looksLikeCsv(`﻿${header}\n1937,67`, JUSTICES_HEADER)).toBe(true);
  });
  it("rejects HTML and CSVs missing required columns", () => {
    expect(looksLikeCsv("<!DOCTYPE html><html>", JUSTICES_HEADER)).toBe(false);
    expect(looksLikeCsv("term,justice\n1,2", JUSTICES_HEADER)).toBe(false);
  });
});

describe("release helpers", () => {
  it("picks the latest year folder, ignoring other entries", () => {
    expect(latestReleaseYear(["2022", "2024", "notes", "2023"])).toBe(2024);
    expect(latestReleaseYear([".DS_Store"])).toBeNull();
  });
  it("reads the release label from a README", () => {
    expect(releaseLabelFromReadme("Based on the 2024 Release 01 of SCDB")).toBe("2024 Release 01");
    expect(releaseLabelFromReadme("nothing here")).toBeNull();
  });
});

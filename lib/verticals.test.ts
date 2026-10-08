import { existsSync } from "node:fs";
import { join } from "node:path";
import { STATIC_PAGES } from "./site-info";
import { describe, expect, it } from "vitest";
import {
  activeBranch,
  activeSection,
  branches,
  liveSections,
  sectionRow,
  verticalRedirects,
} from "./verticals";

describe("verticals config", () => {
  it("has unique vertical slugs and unique section slugs per vertical", () => {
    expect(new Set(branches.map((b) => b.id)).size).toBe(branches.length);
    for (const b of branches) {
      expect(new Set(b.sections.map((s) => s.id)).size).toBe(b.sections.length);
    }
  });

  it("every default section exists; a vertical is live iff its default is", () => {
    for (const b of branches) {
      const d = b.sections.find((s) => s.id === b.defaultSection);
      expect(d, `${b.id} default`).toBeDefined();
      expect(b.status).toBe(d!.status);
    }
  });

  it("every live section has an app route", () => {
    for (const s of liveSections()) {
      expect(existsSync(join(process.cwd(), "app", s.href, "page.tsx")), s.href).toBe(true);
    }
  });

  it("soon sections have no route", () => {
    for (const b of branches)
      for (const s of b.sections.filter((x) => x.status === "soon"))
        expect(existsSync(join(process.cwd(), "app", s.href)), s.href).toBe(false);
  });

  it("redirects cover only live verticals and point at live sections", () => {
    const live = new Set(liveSections().map((s) => s.href));
    for (const r of verticalRedirects()) {
      expect(live.has(r.destination), r.destination).toBe(true);
    }
    expect(verticalRedirects().length).toBe(branches.filter((b) => b.status === "live").length);
  });

  it("resolves pathnames to vertical and section", () => {
    expect(activeBranch("/")).toBeUndefined();
    expect(activeBranch("/congress/senators/x/y")?.id).toBe("congress");
    expect(activeSection(branches.find((b) => b.id === "congress")!,"/congress/wealth")?.id).toBe("wealth");
    expect(sectionRow("/congress/senators/x/y")?.active).toBeUndefined();
    expect(sectionRow("/")).toBeNull();
  });

  it("top-level static pages belong to no vertical and get no section row", () => {
    for (const path of STATIC_PAGES) {
      expect(activeBranch(path)).toBeUndefined();
      expect(sectionRow(path)).toBeNull();
    }
  });
});

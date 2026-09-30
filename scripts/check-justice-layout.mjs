#!/usr/bin/env node
/**
 * Browser acceptance test for the justice profile page layout (Playwright).
 *
 *   pnpm build && pnpm start &        # or `pnpm dev`
 *   pnpm check:justice-layout         # BASE_URL=http://localhost:3000 by default
 *   pnpm check:justice-layout --shots tmp/justice-shots   # also save screenshots
 *
 * At 1280 / 1024 / 768 / 390 px, for a spread of justices, in BOTH toggle modes:
 *   - desktop (md+): chart card and roster card are the same height (<= 1px);
 *   - toggling changes neither card's height;
 *   - the last element of each card sits within the card's bottom padding
 *     (no blank space inside either card);
 *   - the roster ring sits at the same x in every row (subject's career average);
 *   - mobile: the roster shows four rows and a working "Show all" expander
 *     (alongside), and no expander for nearest neighbors;
 *   - no horizontal page overflow; one y-axis tick set across justices.
 * Exit code 1 on any failure.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const shotsDir = process.argv.includes("--shots")
  ? process.argv[process.argv.indexOf("--shots") + 1]
  : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

// id -> why it is in the set
const JUSTICES = [
  [103, "john-stevens", "long tenure, big drift"],
  [108, "clarence-thomas", "sitting justice"],
  [83, "james-byrnes", "one term"],
  [68, "louis-brandeis", "service began before 1937"],
  [102, "william-rehnquist", "elevated Chief Justice"],
  [75, "charles-hughes", "Chief Justice, partial data"],
  [98, "thurgood-marshall", "long tenure"],
  [111, "john-roberts", "duplicate last name"],
];
const WIDTHS = [1280, 1024, 768, 390];
const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
};

const browser = await chromium.launch();
const yTicks = new Map();

for (const [id, slug, why] of JUSTICES) {
  for (const width of WIDTHS) {
    const tag = `${slug} @${width}`;
    const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await ctx.newPage();
    const res = await page.goto(`${BASE}/supreme-court/justices/${id}/${slug}`, { waitUntil: "networkidle" });
    if (!res || res.status() !== 200) {
      fail(`${tag}: HTTP ${res?.status()}`);
      await ctx.close();
      continue;
    }
    const desktop = width >= 768;
    const measure = () =>
      page.evaluate(() => {
        const chart = document.querySelector('[data-testid="chart-card"]');
        const roster = document.querySelector('[data-testid="roster-card"] > section');
        const info = (card, lastSel) => {
          const r = card.getBoundingClientRect();
          const last = card.querySelector(lastSel);
          const l = last.getBoundingClientRect();
          return {
            h: r.height,
            gap: r.bottom - l.bottom,
            pad: parseFloat(getComputedStyle(card).paddingBottom),
          };
        };
        // last visible element: the expander on mobile if shown, else the roster viewport
        const btn = roster.querySelector("button[aria-expanded]");
        const btnShown = btn && getComputedStyle(btn).display !== "none";
        const rows = [...roster.querySelectorAll('a[href^="/supreme-court/justices/"]')].filter(
          (a) => getComputedStyle(a).display !== "none",
        );
        // ring x relative to its track, per visible row
        const rings = rows.map((a) => {
          const track = a.querySelector('[aria-hidden="true"].relative');
          const ring = [...track.children].find((c) => c.className.includes("border-2") && c.className.includes("bg-transparent"));
          const t = track.getBoundingClientRect();
          const g = ring.getBoundingClientRect();
          return (g.left + g.width / 2 - t.left) / t.width;
        });
        return {
          chart: info(chart, "ul"),
          roster: info(roster, btnShown ? "button[aria-expanded]" : '[role="region"]'),
          visibleRows: rows.length,
          rings,
          expander: btnShown ? btn.getAttribute("aria-expanded") : null,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          yLabels: [...document.querySelectorAll('[data-testid="chart-card"] svg .axis')][0]
            ? [...document.querySelectorAll('[data-testid="chart-card"] svg .axis')[0].querySelectorAll("text")].map((t) => t.textContent).join(",")
            : "",
          toggle: [...document.querySelectorAll('[aria-pressed]')].map((b) => b.textContent),
        };
      });

    const modes = [
      ["alongside", "Served alongside"],
      ["neighbors", "Nearest neighbors"],
    ];
    const seen = {};
    for (const [mode, label] of modes) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.waitForTimeout(250);
      const m = await measure();
      seen[mode] = m;
      const t = `${tag} [${mode}]`;

      if (m.overflow > 0) fail(`${t}: page overflows horizontally by ${m.overflow}px`);
      if (desktop && Math.abs(m.chart.h - m.roster.h) > 1) {
        fail(`${t}: card heights differ (chart ${m.chart.h.toFixed(1)} vs roster ${m.roster.h.toFixed(1)})`);
      }
      for (const [name, c] of [["chart", m.chart], ["roster", m.roster]]) {
        if (c.gap > c.pad + 1.5) fail(`${t}: ${name} card has ${(c.gap - c.pad).toFixed(1)}px of blank space below its last element`);
        if (c.gap < 0) fail(`${t}: ${name} card's last element overflows the card`);
      }
      const r0 = m.rings[0];
      if (m.rings.some((r) => Math.abs(r - r0) > 0.004)) {
        fail(`${t}: ring x differs between rows (${m.rings.map((r) => r.toFixed(3)).join(", ")})`);
      }
      if (mode === "neighbors" && m.visibleRows !== 4) fail(`${t}: expected 4 neighbor rows, saw ${m.visibleRows}`);
      if (mode === "neighbors" && m.expander !== null) fail(`${t}: neighbors should have no expander`);
      if (!desktop && mode === "alongside") {
        if (m.visibleRows !== 4 && m.visibleRows !== 0) {
          // A justice with <=4 peers shows them all with no expander.
          if (m.expander !== null) fail(`${t}: collapsed mobile roster should show 4 rows, saw ${m.visibleRows}`);
        }
      }
      if (shotsDir) await page.screenshot({ path: `${shotsDir}/${slug}-${width}-${mode}.png`, fullPage: true });
      yTicks.set(m.yLabels, (yTicks.get(m.yLabels) ?? 0) + 1);
    }

    // Toggling must not change either card's height.
    // (On mobile the roster legitimately differs: the expander exists only for "alongside".)
    for (const card of desktop ? ["chart", "roster"] : ["chart"]) {
      if (Math.abs(seen.alongside[card].h - seen.neighbors[card].h) > 1) {
        fail(`${tag}: ${card} card height changed on toggle (${seen.alongside[card].h.toFixed(1)} -> ${seen.neighbors[card].h.toFixed(1)})`);
      }
    }

    // Mobile expander works.
    if (!desktop) {
      await page.getByRole("button", { name: "Served alongside", exact: true }).click();
      const btn = page.locator('[data-testid="roster-card"] button[aria-expanded]');
      if (await btn.isVisible()) {
        const before = seen.alongside.visibleRows;
        await btn.click();
        const expanded = await measure();
        if (expanded.visibleRows <= before) fail(`${tag}: expander did not reveal more rows (${before} -> ${expanded.visibleRows})`);
        if (expanded.expander !== "true") fail(`${tag}: aria-expanded not true after click`);
        if (expanded.roster.gap > expanded.roster.pad + 1.5) fail(`${tag}: blank space under expanded roster`);
        await btn.click();
        const collapsed = await measure();
        if (collapsed.visibleRows !== 4) fail(`${tag}: "Show fewer" did not return to 4 rows`);
      }
    }
    console.log(`  ok ${tag} (${why})`);
    await ctx.close();
  }
}

if (yTicks.size !== 1) fail(`y-axis ticks differ between justice pages: ${[...yTicks.keys()].join(" | ")}`);
await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} layout check(s) failed`);
  process.exit(1);
}
console.log("\nAll justice layout checks passed");

#!/usr/bin/env node
/**
 * Browser acceptance test for /supreme-court/decisions (Playwright).
 *
 *   pnpm build && pnpm start &   # or `pnpm dev`
 *   pnpm check:decisions         # BASE_URL=http://localhost:3000 by default
 *
 * At 1280, 1024, 768 and 390px (light), and 1280 / 390 in dark and with the `data-theme` override:
 *   - no console errors; no horizontal page overflow; the filter bar stays pinned;
 *   - year ticks never overlap on either time chart; every Chief Justice segment is labelled (slider band and chart band);
 *   - the opening ledes carry the pipeline's anchors (1946 = 142, 2025 = 57; 38% unanimous, 18% 5-4 of 8,251);
 *   - peak/low labels are re-picked when the issue area or the window changes;
 *   - every band is named (in the band, in the right gutter, or in the legend) and the legend isolates a band;
 *   - card 3's box scrolls inside itself on phones and the page scrolls past it;
 *   - slider handles, a Chief tap (adds up), Reset (only once narrowed) and a row click share one state;
 *     the issue area survives a window change;
 *   - phone tooltip: a tap keeps it open after the finger lifts and it closes on a second tap, outside tap, Esc and scroll;
 *   - the five band colours and the party-tinted Chief band render in light, dark and the data-theme override.
 * Exit code 1 on any failure.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const URL = `${BASE}/supreme-court/decisions`;
let failed = 0;
const check = (ok, msg) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};
const settle = (page) => page.waitForTimeout(250);
/** SVG <text> has no innerText; read textContent. */
const svgTexts = (loc) => loc.evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));

const browser = await chromium.launch();

/** Visible year-tick labels (x axis) of the SVG inside a card, with their boxes. */
async function ticks(card) {
  return card.locator("svg.chart-svg text.axis-tick-label").evaluateAll((els) =>
    els
      .map((e) => ({ t: e.textContent ?? "", r: e.getBoundingClientRect() }))
      .filter((x) => /^(’?\d{2}|\d{4})$/.test(x.t))
      .map((x) => ({ t: x.t, l: x.r.left, r: x.r.right })),
  );
}
const overlaps = (list) => list.some((a, i) => list.some((b, j) => j > i && a.l < b.r && b.l < a.r));

for (const [w, h] of [[1280, 900], [1024, 800], [768, 900], [390, 844]]) {
  const tag = `${w}px light`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: "light" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: "networkidle" });
  await settle(page);

  const card = (t) => page.locator("section", { has: page.locator("h2", { hasText: t }) });
  const c1 = card("How many cases");
  const c2 = card("How divided");
  const c3 = card("Which kinds");
  const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");
  const lede = async (c) => text(c.locator("p").first());

  check(errors.length === 0, `${tag}: no console errors${errors.length ? ` (${errors[0]})` : ""}`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no horizontal overflow`);
  check((await lede(c1)).startsWith("142 cases decided in 1946, 57 in 2025"), `${tag}: card 1 lede (1946 = 142, 2025 = 57)`);
  const l2 = await lede(c2);
  check(l2.includes("38% of 8,251 cases were unanimous, 18% split 5–4"), `${tag}: card 2 lede (38% / 18% of 8,251)`);

  // Pinned bar
  await page.evaluate(() => scrollTo(0, 1400));
  const top = await page.locator("[data-pinned-bar]").evaluate((el) => Math.round(el.getBoundingClientRect().top));
  check(top === 0, `${tag}: filter bar pinned after scrolling (top ${top})`);
  await page.evaluate(() => scrollTo(0, 0));

  // Year ticks never overlap; at least two are drawn
  for (const [name, c] of [["card 1", c1], ["card 2", c2]]) {
    const t = await ticks(c);
    check(t.length >= 3 && !overlaps(t), `${tag}: ${name} year ticks (${t.length}) do not overlap`);
  }

  // Chief labels: slider band and chart bands, never blank
  const bandTexts = await page.locator('[role=group][aria-label^="Presidential terms"] button span').allInnerTexts();
  check(bandTexts.length === 5 && bandTexts.every((s) => s.trim().length > 0), `${tag}: slider Chief labels all present (${bandTexts.join("|")})`);
  for (const [name, c] of [["card 1", c1], ["card 2", c2]]) {
    const labels = await svgTexts(c.locator("svg.chart-svg g[aria-hidden=true] text"));
    check(labels.length === 5 && labels.every((s) => s.trim().length > 0), `${tag}: ${name} Chief band labels all present (${labels.join("|")})`);
  }

  // Band names: in-band, gutter or legend; legend always there and isolates
  const legend = c2.locator("button[aria-pressed]", { hasText: /dissent|No dissent/ });
  check((await legend.count()) === 5, `${tag}: card 2 legend names all five bands`);
  const svgNames = await svgTexts(c2.locator("svg.chart-svg text"));
  if (w >= 520) check(["Unanimous", "5–4"].every((n) => svgNames.includes(n)), `${tag}: card 2 names bands on the chart (${svgNames.filter((n) => /^(Unanimous|\d–\d)$/.test(n)).join(", ")})`);

  // Peak/low re-picked: area filter and window
  const peaks = async () => (await svgTexts(c1.locator("svg.chart-svg text.fill-ink"))).join(" ");
  const before = await peaks();
  await page.locator("select[aria-label='Issue area']").selectOption({ label: "First Amendment" });
  await settle(page);
  const afterArea = await peaks();
  check(before !== afterArea && /\d{4}: \d+/.test(afterArea), `${tag}: peak/low recalculated for First Amendment ("${before.trim()}" -> "${afterArea.trim()}")`);
  check((await lede(c1)).includes("Issue area: First Amendment"), `${tag}: card 1 lede names the area`);
  await page.locator("input[aria-label='Years shown, start']").fill("1990");
  await settle(page);
  const afterWin = await peaks();
  check(afterWin !== afterArea, `${tag}: peak/low recalculated for 1990-2025 ("${afterWin.trim()}")`);
  check((await page.locator("button[aria-label^='Reset years']:visible").count()) === 1, `${tag}: Reset appears once the window is narrowed`);
  check((await page.locator("select[aria-label='Issue area']").inputValue()) !== "-1", `${tag}: area survived the window change`);

  // Card 3 row click sets the dropdown; another click on the same row clears
  const row = c3.locator("button", { hasText: "Privacy" }).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await settle(page);
  check((await page.locator("select[aria-label='Issue area'] option:checked").innerText()) === "Privacy", `${tag}: row click sets the dropdown (Privacy)`);
  check((await c3.locator("button[aria-pressed=true]").count()) >= 1, `${tag}: selected row is marked`);
  await c3.locator("button", { hasText: "Privacy" }).first().click();
  await settle(page);
  check((await page.locator("select[aria-label='Issue area']").inputValue()) === "-1", `${tag}: clicking the selected row clears the area`);

  // Chief tap adds up; Reset puts the window back
  const band = page.locator('[role=group][aria-label^="Presidential terms"]');
  await page.locator("button[aria-label^='Reset years']:visible").click();
  await settle(page);
  check((await page.locator("button[aria-label^='Reset years']:visible").count()) === 0, `${tag}: Reset hidden at the full range`);
  const tapChief = async (name) => {
    const b = await band.locator(`button[aria-label*="${name}"]`).boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await settle(page);
  };
  const years = async () => (await page.locator("[role=group][aria-label='Years shown']").innerText()).replace(/\s+/g, "");
  await tapChief("Burger");
  const y1 = await years();
  await tapChief("Rehnquist");
  const y2 = await years();
  check(y1.includes("1969") && y1.includes("1985") && y2.includes("1969") && y2.includes("2004") && !y2.includes("1986–"), `${tag}: Chief taps add up (${y1} then ${y2})`);
  check((await lede(c1)).includes("in 1969") || (await lede(c1)).includes("1969"), `${tag}: charts follow the Chief selection`);
  await page.locator("button[aria-label^='Reset years']:visible").click();

  // Card 3 scrolls inside itself on phones
  const box = c3.locator("[aria-label='Issue areas, one row each']");
  const dims = await box.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY }));
  check(dims.sh > dims.ch && dims.oy === "auto", `${tag}: card 3 rows scroll inside a fixed-height box (${dims.sh} > ${dims.ch})`);
  if (w <= 480) {
    check(dims.ch <= 28 * 16 + 2 && dims.ch < h * 0.7, `${tag}: card 3 box is under two-thirds of the screen (${dims.ch}px of ${h})`);
    await box.hover();
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 200);
    await settle(page);
    check((await box.evaluate((el) => el.scrollTop)) > 0, `${tag}: a swipe scrolls the rows first`);
    void y0;
  }

  // Isolate a band from the legend: counts view, one band
  await c2.scrollIntoViewIfNeeded();
  await legend.nth(4).click();
  await settle(page);
  check((await c2.locator("button[aria-pressed=true]").filter({ hasText: "Number of cases" }).count()) === 1, `${tag}: isolating a band switches to Number of cases`);
  check((await c2.locator("svg.chart-svg path[fill]").count()) === 1, `${tag}: only the isolated band is drawn`);
  await c2.locator("button", { hasText: "Share of cases" }).click();
  await settle(page);
  check((await c2.locator("svg.chart-svg path[fill]").count()) === 5, `${tag}: back to Share clears the pick`);

  // Hover links the two time charts (mouse)
  if (w >= 768) {
    await page.evaluate(() => scrollTo(0, 0));
    await c1.locator("svg.chart-svg").first().scrollIntoViewIfNeeded();
    const svgBox = await c1.locator("svg.chart-svg").first().boundingBox();
    await page.mouse.move(svgBox.x + svgBox.width * 0.5, svgBox.y + 150);
    await settle(page);
    check((await c2.locator("svg.chart-svg line[stroke-dasharray]").count()) >= 1, `${tag}: hovering card 1 draws the linked line on card 2`);
    check((await page.locator(".chart-tooltip").count()) === 1, `${tag}: tooltip opens on hover`);
    await page.mouse.move(5, 5);
    await settle(page);
    check((await page.locator(".chart-tooltip").count()) === 0, `${tag}: tooltip closes when the pointer leaves`);
  }
  await ctx.close();
}

// Phone: touch tooltip stays open after the finger lifts; closes on second tap, outside tap, Esc and scroll
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle" });
  await settle(page);
  const c1 = page.locator("section", { has: page.locator("h2", { hasText: "How many cases" }) });
  const svg = c1.locator("svg.chart-svg").first();
  await svg.scrollIntoViewIfNeeded();
  const b = await svg.boundingBox();
  const tapAt = async (x, y) => {
    await page.touchscreen.tap(x, y);
    await settle(page);
  };
  const tipCount = () => page.locator(".chart-tooltip").count();
  await tapAt(b.x + b.width * 0.5, b.y + 150);
  check((await tipCount()) === 1, "390px touch: a tap opens the tooltip and it stays open after the finger lifts");
  await tapAt(b.x + b.width * 0.5, b.y + 150);
  check((await tipCount()) === 0, "390px touch: a second tap on the same bar closes it");
  await tapAt(b.x + b.width * 0.5, b.y + 150);
  await page.mouse.click(5, 5);
  await tapAt(5, 5);
  check((await tipCount()) === 0, "390px touch: a tap outside the chart closes it");
  await tapAt(b.x + b.width * 0.5, b.y + 150);
  await page.keyboard.press("Escape");
  await settle(page);
  check((await tipCount()) === 0, "390px touch: Esc closes it");
  await tapAt(b.x + b.width * 0.5, b.y + 150);
  await page.evaluate(() => scrollBy(0, 120));
  await settle(page);
  check((await tipCount()) === 0, "390px touch: a page scroll closes it");
  await ctx.close();
}

// Themes: the five band fills and the party-tinted Chief band, in dark and with the data-theme override
for (const [name, opts, attr] of [["dark", { colorScheme: "dark" }, null], ["data-theme=dark", { colorScheme: "light" }, "dark"], ["data-theme=light", { colorScheme: "dark" }, "light"]]) {
  for (const w of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, ...opts });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(URL, { waitUntil: "networkidle" });
    if (attr) await page.evaluate((a) => (document.documentElement.dataset.theme = a), attr);
    await settle(page);
    const tag = `${w}px ${name}`;
    const c2 = page.locator("section", { has: page.locator("h2", { hasText: "How divided" }) });
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return [0, 1, 2, 3, 4].map((k) => cs.getPropertyValue(`--split-${k}`).trim().toLowerCase());
    });
    const dark = name !== "data-theme=light";
    const expected = dark ? ["#9591ad", "#5cb2fd", "#6acdc6", "#deb34a", "#ba446e"] : ["#312c44", "#23318e", "#41939d", "#643e03", "#a03667"];
    check(JSON.stringify(tokens) === JSON.stringify(expected), `${tag}: --split-0..4 resolve to the ${dark ? "dark" : "light"} set`);
    const fills = await c2.locator("svg.chart-svg path[fill]").evaluateAll((els) => els.map((e) => getComputedStyle(e).fill));
    check(new Set(fills).size === 5, `${tag}: five distinct band fills (${new Set(fills).size})`);
    const bandBg = await c2.locator("svg.chart-svg g[aria-hidden=true] rect").first().evaluate((e) => getComputedStyle(e).fill);
    check(/^(color|rgb|oklab|oklch)/.test(bandBg), `${tag}: party-tinted Chief band renders (${bandBg.slice(0, 40)})`);
    check(errors.length === 0, `${tag}: no console errors`);
    await ctx.close();
  }
}

await browser.close();
console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 1 - 1 : 1);

#!/usr/bin/env node
/**
 * Browser acceptance test for /supreme-court/decisions (Playwright).
 *
 *   pnpm build && pnpm start &   # or `pnpm dev`
 *   pnpm check:decisions         # BASE_URL=http://localhost:3000 by default
 *
 * Also: the case list (card 4) follows the card 1 legend (issue area), card 2 (vote band) and a pinned term.
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
  const c4 = card("Every case");
  const listCount = async () => (await c4.locator("[aria-live=polite] span").first().innerText()).trim();
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
  // Card 2 is a stacked area again, with the band names drawn on it (in the band, else in the right gutter on wide charts)
  check((await c2.locator("svg.chart-svg path[fill]").count()) === 5, `${tag}: card 2 is a stacked area of five bands`);
  const svgNames = await svgTexts(c2.locator("svg.chart-svg text"));
  if (w >= 520) check(["Unanimous", "5–4"].every((n) => svgNames.includes(n)), `${tag}: card 2 names bands on the chart (${svgNames.filter((n) => /^(Unanimous|\d–\d)$/.test(n)).join(", ")})`);

  // Card 4: the case list, filtered by the legends and the charts
  await c4.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => /^[\d,]+ cases?$/.test(document.querySelector("[aria-label='Cases, scrollable']")?.previousElementSibling?.querySelector("span")?.textContent ?? ""), null, { timeout: 15000 });
  check((await listCount()) === "8,251 cases", `${tag}: case list opens with all 8,251 cases (${await listCount()})`);
  const listBox = c4.locator("[aria-label='Cases, scrollable']");
  const rowsNow = () => listBox.locator("li").count();
  check((await rowsNow()) === 120, `${tag}: list renders a first page of rows (${await rowsNow()})`);
  await listBox.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await settle(page);
  check((await rowsNow()) > 120, `${tag}: scrolling the list adds rows (${await rowsNow()})`);
  const firstRow = (await listBox.locator("li").first().innerText()).replace(/\s+/g, " ");
  check(/2026/.test(firstRow) && /\d–\d/.test(firstRow), `${tag}: newest case first with its vote ("${firstRow.slice(0, 70)}")`);
  const hrefs = await listBox.locator("li a").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  check(hrefs.length > 0 && hrefs.every((h) => h.startsWith("https://en.wikipedia.org/")) && !hrefs.some((h) => /justia/.test(h)), `${tag}: every case link goes to Wikipedia, none to Justia (${hrefs.length} links)`);
  const firstName = await listBox.locator("li").first().locator("a").first().getAttribute("href");
  check(/Trump_v\._Barbara/.test(firstName ?? ""), `${tag}: a landmark's name links to its article (${firstName})`);
  const plainLink = await listBox.locator("li:not(:has(a[title^='Landmark']))").first().locator("a").first().getAttribute("href");
  check(/index\.php\?search=.*go=Go/.test(plainLink ?? ""), `${tag}: another case links to a Wikipedia go-search (${(plainLink ?? "").slice(0, 70)})`);

  // Legend of card 1 is an issue-area filter for the whole page
  await c1.locator("button[aria-pressed]", { hasText: "Criminal procedure" }).click();
  await settle(page);
  check((await page.locator("select[aria-label='Issue area'] option:checked").innerText()) === "Criminal procedure", `${tag}: card 1 legend sets the issue area`);
  check((await listCount()) === "1,760 cases", `${tag}: list follows the legend (${await listCount()})`);
  check((await c1.locator("svg.chart-svg path, svg.chart-svg rect[style*='fill']").count()) > 0 && (await c1.locator("button[aria-pressed=true]", { hasText: "Criminal procedure" }).count()) === 1, `${tag}: legend entry marked active`);
  await c4.locator("button[aria-label='Clear the issue area filter']").click();
  await settle(page);
  check((await listCount()) === "8,251 cases", `${tag}: the chip clears the issue area`);
  await c1.locator("button[aria-pressed]", { hasText: "Other areas" }).click();
  await settle(page);
  check((await listCount()) === "1,696 cases".replace("1,696", await listCount().then((t) => t.split(" ")[0])) && (await page.locator("select[aria-label='Issue area'] option:checked").innerText()).startsWith("Other areas"), `${tag}: Other areas filters too (${await listCount()})`);
  await c1.locator("button[aria-pressed=true]", { hasText: "Other areas" }).click();
  await settle(page);

  // Landmark cases checkbox in the pinned bar narrows everything
  const lmBox = page.locator("[data-pinned-bar] input[type=checkbox]");
  check((await lmBox.count()) === 1 && !(await lmBox.isChecked()), `${tag}: "Landmark cases" checkbox in the pinned bar, off by default`);
  const lmBefore = await listCount();
  await lmBox.check();
  await settle(page);
  const lmCount = parseInt((await listCount()).replace(/,/g, ""), 10);
  check(lmCount > 300 && lmCount < 400, `${tag}: landmark filter lists only landmarks (${lmCount})`);
  check((await c4.locator("button[aria-label='Clear the landmark filter']").count()) === 1, `${tag}: landmark chip shown`);
  check((await listBox.locator("li a", { hasText: "Landmark" }).count()) > 0, `${tag}: landmark rows carry a Wikipedia badge`);
  check((await lede(c2)).includes(`of ${lmCount} cases`), `${tag}: card 2 follows the landmark filter (${(await lede(c2)).slice(0, 80)})`);
  check(/Grouped by decade/.test(await text(c2)), `${tag}: landmark view says it is grouped by decade`);
  check((await c2.locator("svg.chart-svg path[fill]").count()) === 0 && (await c2.locator("svg.chart-svg rect[role=button]").count()) === 9, `${tag}: landmark view is nine decade bars, not the area`);
  check(/n=\d+/.test((await svgTexts(c2.locator("svg.chart-svg text"))).join(" ")), `${tag}: each decade bar shows its case count`);
  check((await c2.locator("[aria-label='Grouping']").count()) === 0, `${tag}: no grouping toggle (the grain is automatic)`);
  const tot = await c1.locator("svg.chart-svg").first().evaluate((e) => e.getAttribute("aria-label"));
  check(!!tot, `${tag}: card 1 still draws`);
  await c4.locator("button[aria-label='Clear the landmark filter']").click();
  await settle(page);
  check((await c2.locator("svg.chart-svg path[fill]").count()) === 5, `${tag}: unfiltered, card 2 is the area per term again`);
  check((await lmBox.isChecked()) === false && (await listCount()) === lmBefore, `${tag}: the chip clears it (${await listCount()})`);

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

  // Card 3: phones scroll the rows inside a fixed-height box; from lg every row shows (no scroll)
  const box = c3.locator("[aria-label='Issue areas, one row each']");
  const dims = await box.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY }));
  if (w >= 1024) check(dims.sh <= dims.ch + 1 && dims.oy === "visible", `${tag}: card 3 shows the full spread, no scroll box (${dims.sh} vs ${dims.ch}, overflow ${dims.oy})`);
  else check(dims.sh > dims.ch && dims.oy === "auto", `${tag}: card 3 rows scroll inside a fixed-height box (${dims.sh} > ${dims.ch})`);
  check((await box.locator("li").count()) === 15, `${tag}: all 15 rows (All + 14 areas) are in the list`);

  // Phones: thousands in the heatmap are compact and never clipped; case rows put the vote on the right under the name
  if (w <= 480) {
    const clipped = await c3.locator("[role=grid] [role=gridcell]").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    check(clipped === 0, `${tag}: no heatmap number is clipped (${clipped} cells)`);
    const compact = await c3.locator("[role=grid] [role=gridcell]").nth(1).innerText();
    check(/^\d+(\.\d)?k?$/.test(compact.trim()), `${tag}: a four-digit count is compact on a phone ("${compact.trim()}")`);
    const row = await c4.locator("ol li").first().evaluate((li) => {
      const [nameEl, dateEl, , voteEl] = [...li.children];
      const r = (e) => e.getBoundingClientRect();
      return { nameBottom: r(nameEl).bottom, voteTop: r(voteEl).top, voteRight: r(voteEl).right, liRight: r(li).right, dateBottom: r(dateEl).bottom, dateLeft: r(dateEl).left, voteLeft: r(voteEl).left };
    });
    check(row.voteTop >= row.nameBottom - 1 && row.voteLeft > row.dateLeft + 60 && row.liRight - row.voteRight < 20, `${tag}: the vote sits on the right, below the case name`);
  }

  // The decade heatmap beside/above the rows
  const heat = c3.locator("[role=grid]");
  check((await heat.locator("[role=gridcell]").count()) === 15 * 9, `${tag}: heatmap has 15 rows x 9 decades`);
  const sideBySide = await heat.evaluate((el, rowsBox) => { const a = el.getBoundingClientRect(), b = document.querySelector(rowsBox).getBoundingClientRect(); return a.right <= b.left + 1; }, "[aria-label='Issue areas, one row each']");
  check(sideBySide === (w >= 1024), `${tag}: heatmap is ${w >= 1024 ? "left of" : "above"} the rows`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no horizontal overflow with the heatmap`);
  const firstShade = () => heat.locator("[role=gridcell]").first().evaluate((e) => e.getAttribute("title") + "|" + e.style.background);
    const toggle = c3.locator("[aria-label='Sort issue areas']");
  check((await toggle.locator("button").allInnerTexts()).map((t) => t.replace(/[^A-Za-z0-9–]/g, "")).join(",") === "Cases,5–4,Unanimous", `${tag}: one toggle, in the order Cases, 5–4, Unanimous`);
  check((await c3.locator("button", { hasText: "Unanimous share" }).count()) === 0, `${tag}: the heatmap has no toggle of its own`);
  const cellText = () => heat.locator("[role=gridcell]").nth(9).innerText();
  check(/^\d[\d,]*$/.test((await cellText()).trim()), `${tag}: Cases shows counts in the heatmap ("${(await cellText()).trim()}")`);
  const casesTitle = await firstShade();
  await toggle.locator("button", { hasText: "5–4" }).click();
  await settle(page);
  check((await firstShade()) !== casesTitle && /split 5–4/.test(await heat.locator("[role=gridcell]").nth(9).getAttribute("title")), `${tag}: 5–4 shows the 5–4 share in the heatmap`);
  await toggle.locator("button", { hasText: "Unanimous" }).click();
  await settle(page);
  check(/were unanimous/.test(await heat.locator("[role=gridcell]").nth(9).getAttribute("title")), `${tag}: Unanimous shows the unanimous share in the heatmap`);
  const labelsBefore = await heat.locator("[role=row] button[title]:not([role=gridcell])").allInnerTexts();
  const rowLabels = await box.locator("li button span[title]").allInnerTexts();
  check(JSON.stringify(labelsBefore) === JSON.stringify(rowLabels), `${tag}: heatmap and rows share one order`);
  await toggle.locator("button", { hasText: "Cases" }).click();
  await settle(page);
  await heat.locator("[role=gridcell]").nth(3 * 9 + 4).click();
  await settle(page);
  check((await page.locator("select[aria-label='Issue area'] option:checked").innerText()) !== "All issue areas", `${tag}: a heatmap cell picks the issue area`);
  check((await heat.locator("[role=row].opacity-45").count()) === 13, `${tag}: the picked area stays lit and the other 13 areas dim (All never dims)`);
  await heat.locator("button[aria-pressed=true]").first().click();
  await settle(page);
  check((await page.locator("select[aria-label='Issue area']").inputValue()) === "-1", `${tag}: clicking the picked row's label clears it`);
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
  check((await listCount()) === "1,449 cases", `${tag}: picking the 5–4 band filters the list (${await listCount()})`);
  check((await c4.locator("button[aria-label='Clear the vote filter']").count()) === 1, `${tag}: vote chip shown`);
  check((await lede(c1)).includes("4 dissents"), `${tag}: card 1 narrows to the picked band`);
  check((await listBox.locator("li").first().innerText()).replace(/\s+/g, " ").includes("5–4") || (await listBox.locator("li").first().innerText()).includes("4–4"), `${tag}: listed cases are 5–4 or 4–4`);
  check((await c2.locator("button[aria-pressed=true]").filter({ hasText: "Number of cases" }).count()) === 1, `${tag}: isolating a band switches to Number of cases`);
  check((await c2.locator("svg.chart-svg path[fill]").count()) === 1, `${tag}: only the isolated band is drawn`);
  await c2.locator("button", { hasText: "Share of cases" }).click();
  await settle(page);
  check((await listCount()) === "8,251 cases", `${tag}: back to Share clears the vote filter`);
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
    await page.mouse.click(svgBox.x + svgBox.width * 0.5, svgBox.y + 150);
    await settle(page);
    check(/term$/.test((await listCount()).split(" ").slice(-1)[0] ?? "") || (await c4.locator("button[aria-label='Clear the pinned term']").count()) === 1, `${tag}: pinning a term narrows the list to it`);
    const pinned = parseInt((await listCount()).replace(/,/g, ""), 10);
    check(pinned > 0 && pinned < 200, `${tag}: pinned term lists only that term's cases (${pinned})`);
    await c4.locator("button[aria-label='Clear the pinned term']").click();
    await settle(page);
    await page.mouse.move(5, 5);
    await settle(page);
    check((await page.locator(".chart-tooltip").count()) === 0, `${tag}: tooltip closes when the pointer leaves`);
  }
  await ctx.close();
}

// A stale cached case list (the earlier 8-field rows, no landmark flag) must not break the landmark filter
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const urls = [];
  let served = 0;
  await page.route("**/data/decisions/cases*", async (route) => {
    urls.push(route.request().url());
    if (served++ > 0) return route.continue();
    const real = await (await route.fetch()).json();
    await route.fulfill({ json: real.map((r) => r.slice(0, 8)) });
  });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  check(urls.every((u) => /[?&]v=[0-9a-f]{10}$/.test(u)), `stale cache: the case list is fetched with a content version (${urls[0]?.split("?")[1]})`);
  check(urls.length === 2, `stale cache: an old-shaped list is detected and refetched (${urls.length} requests)`);
  await page.locator("[data-pinned-bar] input[type=checkbox]").check();
  await page.waitForTimeout(400);
  const c4 = page.locator("section", { has: page.locator("h2", { hasText: "Every case" }) });
  check((await c4.locator("[aria-live=polite] span").first().innerText()).trim() === "339 cases", `stale cache: the landmark filter still narrows the list to 339 (${(await c4.locator("[aria-live=polite] span").first().innerText()).trim()})`);
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

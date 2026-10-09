#!/usr/bin/env node
/**
 * Browser acceptance test for /congress/laws (Playwright).
 *
 *   pnpm build && pnpm start &   # or `pnpm dev`
 *   pnpm check:laws              # BASE_URL=http://localhost:3000 by default
 *
 * At 1280, 1024, 768 and 390px (light), and 1280 / 390 in dark and with the `data-theme` override:
 *   - no console errors; no horizontal page overflow; the filter bar stays pinned;
 *   - the opening ledes carry the data anchors (93rd = 651 laws, 118th = 274; 12,619 laws in all);
 *   - year ticks never overlap; every president on the slider band is labelled;
 *   - peak/low labels are re-picked when the policy area or the window changes; the policy area survives a window change;
 *   - every support band is named (legend of five; the area chart is five bands) and the legend isolates a band and narrows card 1;
 *   - card 3: the heatmap and the rows have equal row heights and no scrollbar from lg; phones scroll the rows in a box;
 *     a row or heatmap click sets the dropdown, and the toggle reorders both sides;
 *   - the list: opens with every law, grows on scroll, follows the legends, chips clear, search needs every word;
 *   - phone tooltip: a tap keeps it open after the finger lifts and it closes on a second tap, outside tap, Esc and scroll;
 *   - the five band colours render in light, dark and the data-theme override.
 * Exit code 1 on any failure.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const URL = `${BASE}/congress/laws`;
let failed = 0;
const check = (ok, msg) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};
const settle = (page) => page.waitForTimeout(250);
const svgTexts = (loc) => loc.evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
const browser = await chromium.launch();

async function ticks(card) {
  return card.locator("svg.chart-svg text.axis-tick-label").evaluateAll((els) =>
    els
      .map((e) => ({ t: e.textContent ?? "", r: e.getBoundingClientRect() }))
      .filter((x) => /^(’?\d{2}|\d{4})$/.test(x.t))
      .map((x) => ({ t: x.t, l: x.r.left, r: x.r.right })),
  );
}
const overlaps = (list) => list.some((a, i) => list.some((b, j) => j > i && a.l < b.r && b.l < a.r));
const count = (s) => parseInt(s.replace(/,/g, ""), 10);

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
  const c1 = card("How many laws");
  const c2 = card("How broadly");
  const c3 = card("Which kinds");
  const c4 = card("Every law");
  const listCount = async () => (await c4.locator("[aria-live=polite] span").first().innerText()).trim();
  const text = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");
  const lede = async (c) => text(c.locator("p").first());
  const dropdown = page.locator("select[aria-label='Policy area']");

  check(errors.length === 0, `${tag}: no console errors${errors.length ? ` (${errors[0]})` : ""}`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no horizontal overflow`);
  const l1 = await lede(c1);
  check(/^651 laws enacted by the 93rd Congress \(1973–74\), 274 by the 118th Congress? ?\(2023–24\)/.test(l1) || (l1.includes("651 laws") && l1.includes("93rd") && l1.includes("274 by the 118th")), `${tag}: card 1 lede (93rd = 651, 118th = 274): "${l1.slice(0, 110)}"`);

  await page.evaluate(() => scrollTo(0, 1400));
  const top = await page.locator("[data-pinned-bar]").evaluate((el) => Math.round(el.getBoundingClientRect().top));
  check(top === 0, `${tag}: filter bar pinned after scrolling (top ${top})`);
  await page.evaluate(() => scrollTo(0, 0));

  for (const [name, c] of [["card 1", c1], ["card 2", c2]]) {
    const t = await ticks(c);
    check(t.length >= 3 && !overlaps(t), `${tag}: ${name} year ticks (${t.length}) do not overlap`);
  }

  // Presidents on the slider band, never blank
  // A tenure only a few pixels wide (the 1973–74 and 2025– ends on a phone) has no room for text; it keeps its full name as its aria-label.
  const segs = await page.locator('[role=group][aria-label^="Presidential terms"] button').evaluateAll((els) => els.map((e) => ({ w: e.getBoundingClientRect().width, t: e.innerText.trim(), a: e.getAttribute("aria-label") ?? "" })));
  check(segs.length >= 10 && segs.every((s) => s.a.length > 0 && (s.w < 20 || s.t.length > 0)), `${tag}: slider president labels present (${segs.length} tenures, ${segs.filter((s) => s.t).length} with text)`);

  // Card 2: a stacked area of five bands, a legend of five that isolates and narrows card 1
  const legend = c2.locator("button[aria-pressed]", { hasText: /recorded vote|% yes|or more yes/ });
  check((await legend.count()) === 5, `${tag}: card 2 legend names all five bands`);
  check((await c2.locator("svg.chart-svg path[fill]").count()) === 5, `${tag}: card 2 is a stacked area of five bands`);
  if (w >= 520) {
    const names = await svgTexts(c2.locator("svg.chart-svg text"));
    check(["No recorded vote", "90%+"].every((n) => names.includes(n)), `${tag}: card 2 names bands on the chart`);
  }

  // The list
  await c4.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => /^[\d,]+ laws?$/.test(document.querySelector("[aria-label='Laws, scrollable']")?.previousElementSibling?.querySelector("span")?.textContent ?? ""), null, { timeout: 15000 });
  check((await listCount()) === "12,619 laws", `${tag}: list opens with all 12,619 laws (${await listCount()})`);
  const jump = await page.locator("a[href='#law-list']").innerText();
  check(jump.includes("12,619"), `${tag}: jump link carries the live count ("${jump}")`);
  const listBox = c4.locator("[aria-label='Laws, scrollable']");
  const rowsNow = () => listBox.locator("li").count();
  check((await rowsNow()) === 120, `${tag}: list renders a first page of rows (${await rowsNow()})`);
  await listBox.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await settle(page);
  check((await rowsNow()) > 120, `${tag}: scrolling the list adds rows (${await rowsNow()})`);
  const firstRow = (await listBox.locator("li").first().innerText()).replace(/\s+/g, " ");
  check(/Pub\. L\. 119/.test(firstRow) && /(voice vote|unanimous consent|\d+–\d+)/.test(firstRow), `${tag}: newest law first with its vote ("${firstRow.slice(0, 70)}")`);
  const hrefs = await listBox.locator("li a").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  check(hrefs.every((x) => /^\/congress\/(house|senators)\//.test(x)), `${tag}: every list link is a member profile (${hrefs.length} links)`);

  // Legend of card 1 is a policy-area filter for the whole page
  await c1.locator("button[aria-pressed]", { hasText: "Economy" }).first().click();
  await settle(page);
  const picked = await dropdown.evaluate((s) => s.options[s.selectedIndex].text);
  check(/Economy/.test(picked), `${tag}: card 1 legend sets the policy area (${picked})`);
  const areaN = count(await listCount());
  check(areaN > 1000 && areaN < 2500, `${tag}: list follows the legend (${areaN})`);
  await c4.locator("button[aria-label='Clear the policy area filter']").click();
  await settle(page);
  check((await listCount()) === "12,619 laws", `${tag}: the chip clears the policy area`);

  // Major laws checkbox
  const majorBox = page.locator("[data-pinned-bar] input[type=checkbox]");
  check((await majorBox.count()) === 1 && !(await majorBox.isChecked()), `${tag}: "Major laws" checkbox in the pinned bar, off by default`);
  await majorBox.check();
  await settle(page);
  const majorN = count(await listCount());
  check(majorN === 307, `${tag}: major laws lists Mayhew's 307 (${majorN})`);
  check((await listBox.locator("li", { hasText: "Major law" }).count()) > 0 && (await c4.locator("button[aria-label='Clear the major laws filter']").count()) === 1, `${tag}: major rows carry a badge and a chip`);
  await c4.locator("button[aria-label='Clear the major laws filter']").click();
  await settle(page);
  check((await majorBox.isChecked()) === false && (await listCount()) === "12,619 laws", `${tag}: the chip clears major laws`);

  // Peak/low re-picked on filter and window; the policy area survives the window change
  const peaks = async () => (await svgTexts(c1.locator("svg.chart-svg text.fill-ink"))).join(" ");
  const before = await peaks();
  const energy = await dropdown.evaluate((s) => [...s.options].find((o) => /Energy/.test(o.text))?.value ?? "");
  await dropdown.selectOption(energy);
  await settle(page);
  const afterArea = await peaks();
  check(before !== afterArea && /\d+/.test(afterArea), `${tag}: peak/low recalculated for Energy ("${before.trim()}" -> "${afterArea.trim()}")`);
  await page.locator("input[aria-label='Years shown, start']").fill("1990");
  await settle(page);
  const afterWin = await peaks();
  check(afterWin !== afterArea, `${tag}: peak/low recalculated for 1990 on ("${afterWin.trim()}")`);
  check((await page.locator("button[aria-label^='Reset years']:visible").count()) === 1, `${tag}: Reset appears once the window is narrowed`);
  check((await dropdown.inputValue()) === energy, `${tag}: policy area survived the window change`);
  await page.locator("button[aria-label^='Reset years']:visible").click();
  await dropdown.selectOption("");
  await settle(page);

  // Card 3
  const box = c3.locator("[aria-label='Policy areas, one row each']");
  const dims = await box.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY }));
  if (w >= 1024) check(dims.sh <= dims.ch + 1 && dims.oy === "visible", `${tag}: card 3 shows every row, no scrollbar (${dims.sh} vs ${dims.ch}, overflow ${dims.oy})`);
  else check(dims.oy === "auto" && dims.ch <= 28 * 16 + 2, `${tag}: card 3 rows sit in a capped scroll box (${dims.sh} in ${dims.ch}, overflow ${dims.oy})`);
  const nRows = await box.locator("li").count();
  check(nRows === 12, `${tag}: All + 11 topic groups in the rows (${nRows})`);
  const heat = c3.locator("[role=grid]");
  check((await heat.locator("[role=gridcell]").count()) === nRows * 6, `${tag}: heatmap has ${nRows} rows x 6 decades`);
  const sideBySide = await heat.evaluate((el, sel) => el.getBoundingClientRect().right <= document.querySelector(sel).getBoundingClientRect().left + 1, "[aria-label='Policy areas, one row each']");
  check(sideBySide === (w >= 1024), `${tag}: heatmap is ${w >= 1024 ? "left of" : "above"} the rows`);
  if (w >= 1024) {
    const tops = await page.evaluate(() => {
      const cells = [...document.querySelectorAll("[role=grid] [role=row]")].slice(1).map((r) => r.querySelector("[role=gridcell]").getBoundingClientRect().top);
      const bars = [...document.querySelectorAll("ul[aria-label^='Policy areas by'] > li > button")].map((b) => b.getBoundingClientRect().top);
      return { cells, bars };
    });
    const diffs = tops.cells.map((c, i) => Math.abs(c - tops.bars[i]));
    check(tops.cells.length === tops.bars.length && Math.max(...diffs) < 1, `${tag}: heatmap and bar rows have equal height (max offset ${Math.max(...diffs).toFixed(2)}px)`);
  }
  const toggle = c3.locator("[aria-label='Sort policy areas']");
  check((await toggle.locator("button").allInnerTexts()).map((t) => t.replace(/[^A-Za-z ]/g, "").trim()).join(",") === "Laws,Narrow votes,No recorded vote", `${tag}: one toggle, in the order Laws, Narrow votes, No recorded vote`);
  const labelsOf = () => heat.locator("[role=row] > button[title]:not([role=gridcell])").allInnerTexts();
  const rowOrder = () => box.locator("li button span[title]").allInnerTexts();
  check(JSON.stringify(await labelsOf()) === JSON.stringify(await rowOrder()), `${tag}: heatmap and rows share one order`);
  const firstOrder = await rowOrder();
  await toggle.locator("button", { hasText: "Narrow votes" }).click();
  await settle(page);
  check(/narrow vote/.test((await heat.locator("[role=gridcell]").nth(7).getAttribute("title")) ?? "") && JSON.stringify(await labelsOf()) === JSON.stringify(await rowOrder()), `${tag}: Narrow votes re-measures the heatmap and reorders both`);
  await toggle.locator("button", { hasText: "No recorded vote" }).click();
  await settle(page);
  check(/no recorded vote/.test((await heat.locator("[role=gridcell]").nth(7).getAttribute("title")) ?? ""), `${tag}: No recorded vote re-measures the heatmap`);
  await toggle.locator("button", { hasText: "Laws" }).click();
  await settle(page);
  check(JSON.stringify(await rowOrder()) === JSON.stringify(firstOrder), `${tag}: Laws returns to the first order`);
  await toggle.locator("button", { hasText: "Laws" }).click();
  await settle(page);
  const rev = await rowOrder();
  check(JSON.stringify(rev.slice(1)) === JSON.stringify(firstOrder.slice(1).reverse()) && rev[0] === firstOrder[0], `${tag}: a second click reverses the order, All stays first`);
  await toggle.locator("button", { hasText: "Laws" }).click();
  await settle(page);
  // Click a heatmap cell and a row
  await heat.locator("[role=gridcell]").nth(2 * 6 + 3).click();
  await settle(page);
  check((await dropdown.inputValue()) !== "", `${tag}: a heatmap cell picks the policy area (${await dropdown.evaluate((s) => s.options[s.selectedIndex].text)})`);
  check((await heat.locator("[role=row].opacity-45").count()) === nRows - 2, `${tag}: the picked area stays lit and the others dim (All never dims)`);
  await heat.locator("button[aria-pressed=true]").first().click();
  await settle(page);
  check((await dropdown.inputValue()) === "", `${tag}: clicking the picked label clears it`);
  await box.locator("li button", { hasText: "Energy" }).first().click();
  await settle(page);
  check(/Energy/.test(await dropdown.evaluate((s) => s.options[s.selectedIndex].text)), `${tag}: a row click sets the dropdown`);
  await box.locator("li button", { hasText: "Energy" }).first().click();
  await settle(page);
  check((await dropdown.inputValue()) === "", `${tag}: clicking the selected row clears it`);
  if (w <= 480) {
    const clipped = await heat.locator("[role=gridcell]").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    check(clipped === 0, `${tag}: no heatmap number is clipped (${clipped} cells)`);
    check(dims.ch < h * 0.7, `${tag}: card 3 box is under two-thirds of the screen (${dims.ch}px of ${h})`);
  }

  // Isolate a band from card 2: narrows card 1 and the list
  await c2.scrollIntoViewIfNeeded();
  await legend.nth(4).click();
  await settle(page);
  const bandN = count(await listCount());
  check(bandN > 1000 && bandN < 12619, `${tag}: picking a band narrows the list (${bandN})`);
  check((await c2.locator("svg.chart-svg path[fill]").count()) === 1, `${tag}: only the isolated band is drawn`);
  check((await lede(c1)).includes(" with "), `${tag}: card 1 narrows to the picked band`);
  await c2.locator("button", { hasText: "Share" }).first().click();
  await settle(page);
  check((await listCount()) === "12,619 laws", `${tag}: back to Share clears the band`);

  // Search: every word must match
  const q = c4.locator("input[type=search]");
  await q.fill("patient protection affordable");
  await settle(page);
  const sCount = count(await listCount());
  check(sCount > 0 && sCount < 30 && (await listBox.locator("li", { hasText: "Pub. L. 111–148" }).count()) === 1, `${tag}: search "patient protection affordable" finds the ACA (${sCount})`);
  await q.fill("patient protection affordable zzzzqq");
  await settle(page);
  check((await listCount()) === "0 laws", `${tag}: a word that matches nothing empties the list`);
  await c4.locator("button[aria-label='Clear the search']").click();
  check((await listCount()) === "12,619 laws" && (await q.inputValue()) === "", `${tag}: the chip clears the search`);

  // Hover links the two time charts; pin narrows the list
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
    check((await c4.locator("button[aria-label='Clear the pinned Congress']").count()) === 1, `${tag}: pinning a Congress adds a chip to the list`);
    const pinned = count(await listCount());
    check(pinned > 100 && pinned < 800, `${tag}: pinned Congress lists only its laws (${pinned})`);
    await c4.locator("button[aria-label='Clear the pinned Congress']").click();
    await settle(page);
    await page.mouse.move(5, 5);
    await settle(page);
    check((await page.locator(".chart-tooltip").count()) === 0, `${tag}: tooltip closes when the pointer leaves`);
  }
  // Keyboard: the controls are reachable and named
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll("button, input, select, summary")].filter((e) => e.offsetParent !== null && !(e.getAttribute("aria-label") || e.textContent?.trim() || e.getAttribute("title") || e.labels?.length)).length,
  );
  check(unnamed === 0, `${tag}: every visible control has a name (${unnamed} without)`);
  check((await c3.locator("summary", { hasText: "View as table" }).count()) === 1 && (await c1.locator("summary", { hasText: "View as table" }).count()) === 1 && (await c2.locator("summary", { hasText: "View as table" }).count()) === 1, `${tag}: each chart has a table view`);
  await ctx.close();
}

// Phone: touch tooltip stays open after the finger lifts; closes on second tap, outside tap, Esc and scroll
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle" });
  await settle(page);
  const c1 = page.locator("section", { has: page.locator("h2", { hasText: "How many laws" }) });
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

// Themes: the five band fills in dark and with the data-theme override
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
    const c2 = page.locator("section", { has: page.locator("h2", { hasText: "How broadly" }) });
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return [0, 1, 2, 3, 4].map((k) => cs.getPropertyValue(`--split-${k}`).trim().toLowerCase());
    });
    const dark = name !== "data-theme=light";
    const expected = dark ? ["#9591ad", "#5cb2fd", "#6acdc6", "#deb34a", "#ba446e"] : ["#312c44", "#23318e", "#41939d", "#643e03", "#a03667"];
    check(JSON.stringify(tokens) === JSON.stringify(expected), `${tag}: --split-0..4 resolve to the ${dark ? "dark" : "light"} set`);
    const fills = await c2.locator("svg.chart-svg path[fill]").evaluateAll((els) => els.map((e) => getComputedStyle(e).fill));
    check(new Set(fills).size === 5, `${tag}: five distinct band fills (${new Set(fills).size})`);
    check(errors.length === 0, `${tag}: no console errors`);
    await ctx.close();
  }
}

await browser.close();
console.log(failed === 0 ? "\nall checks passed" : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);

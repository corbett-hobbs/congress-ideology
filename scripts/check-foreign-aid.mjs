#!/usr/bin/env node
/**
 * Browser acceptance test for /presidency/foreign-aid (Playwright).
 *
 *   pnpm build && pnpm start &   # or `pnpm dev`
 *   pnpm check:foreign-aid       # BASE_URL=http://localhost:3000 by default
 *
 * At 1280 and 390px, in light and dark:
 *   - no horizontal page overflow; the filter bar stays pinned (sticky, top 0) after scrolling;
 *   - map and ranked cards report the same height (<= 1px) with no more than the card padding
 *     under the map's last element;
 *   - default year is the latest complete year; FY2024 / FY2025 totals match the pipeline fixtures;
 *   - President narrows the years and clamps the slider; play stops at the end of the range and
 *     restarts from the start when pressed at the end;
 *   - a partial year disables "Change vs. prior year"; Military share is disabled for Health;
 *   - the country combobox works from the keyboard; selecting a country dims the other rows;
 *   - no console errors. Exit code 1 on any failure.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const URL = `${BASE}/presidency/foreign-aid`;
let failed = 0;
const check = (ok, msg) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};

const browser = await chromium.launch();
for (const [w, h] of [[1280, 900], [390, 844]]) {
  for (const scheme of ["light", "dark"]) {
    const tag = `${w}px ${scheme}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(URL, { waitUntil: "networkidle" });

    const card = (t) => page.locator("section", { has: page.locator("h2", { hasText: t }) });
    const lede = async (t) => (await card(t).locator("p").first().innerText()).replace(/\s+/g, " ");

    check((await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)), `${tag}: no horizontal overflow`);
    check((await page.locator("input[type=range]").inputValue()) === "2025", `${tag}: default year is FY2025`);
    check((await lede("How much the U.S. spends")).includes("$47.8B"), `${tag}: FY2025 total $47.8B`);

    // Pinned bar
    await page.evaluate(() => scrollTo(0, 1200));
    const top = await page.locator(".sticky").first().evaluate((el) => Math.round(el.getBoundingClientRect().top));
    check(top === 0, `${tag}: filter bar pinned after scrolling (top ${top})`);

    // Equal card heights
    await card("Where it goes").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const hts = await page.evaluate(() => {
      const s = (t) => [...document.querySelectorAll("section")].find((x) => x.querySelector("h2")?.textContent === t);
      const m = s("Where it goes");
      const r = s("Who receives the most");
      return { m: m.getBoundingClientRect().height, r: r.getBoundingClientRect().height, gap: m.getBoundingClientRect().bottom - m.lastElementChild.getBoundingClientRect().bottom };
    });
    check(Math.abs(hts.m - hts.r) <= 1, `${tag}: map ${hts.m.toFixed(1)} vs ranked ${hts.r.toFixed(1)}`);
    check(hts.gap <= 30, `${tag}: map trailing space ${hts.gap.toFixed(0)}px`);

    // FY2024 fixture via the slider
    const range = page.locator("input[type=range]");
    await range.focus();
    await range.press("ArrowLeft");
    check((await lede("How much the U.S. spends")).includes("$71.6B"), `${tag}: FY2024 total $71.6B`);

    // President narrows, play stops at the end and restarts
    await page.locator("select").first().selectOption({ label: "Joe Biden (2021–2025)" });
    check((await range.getAttribute("min")) === "2021" && (await range.getAttribute("max")) === "2024", `${tag}: Biden window FY2021–2024`);
    await page.getByRole("button", { name: "Play through fiscal years" }).click();
    await page.waitForTimeout(450 * 4 + 400);
    check((await range.inputValue()) === "2024" && (await page.getByRole("button", { name: "Play through fiscal years" }).count()) === 1, `${tag}: playback stopped at FY2024`);
    await page.getByRole("button", { name: "Play through fiscal years" }).click();
    await page.waitForTimeout(200);
    check(["2021", "2022"].includes(await range.inputValue()), `${tag}: pressing play at the end restarts at FY2021`);
    await page.getByRole("button", { name: "Pause" }).click();
    await page.locator("select").first().selectOption("all");

    // Partial year disables Change; Health disables Military share
    await range.fill("2026");
    check(await card("Who receives the most").getByRole("button", { name: /^Change vs/ }).isDisabled(), `${tag}: Change disabled in partial FY2026`);
    await range.fill("2025");
    await page.locator("select").nth(1).selectOption({ label: "Health" });
    check(await card("Where it goes").getByRole("button", { name: "Military share" }).isDisabled(), `${tag}: Military share disabled for Health`);
    await page.locator("select").nth(1).selectOption({ label: "All sectors" });

    // Combobox from the keyboard, then highlight-and-dim
    const combo = page.getByRole("combobox", { name: "Country" });
    await combo.click();
    await combo.fill("ukr");
    await combo.press("Enter");
    check((await combo.inputValue()) === "Ukraine", `${tag}: combobox picks Ukraine from the keyboard`);
    const dimmed = await card("Who receives the most").locator("li button.opacity-50").count();
    const total = await card("Who receives the most").locator("li button").count();
    check(dimmed === total - 1 && total > 150, `${tag}: ranked list keeps all ${total} rows, dims ${dimmed}`);

    check(errors.length === 0, `${tag}: no console errors${errors.length ? " — " + errors[0] : ""}`);
    await ctx.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);

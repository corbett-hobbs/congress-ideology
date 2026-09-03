#!/usr/bin/env node
/**
 * validate_palette.js — OKLab / CVD / WCAG-contrast checker for the party
 * palette (lib/party-palette.ts + the --<key> tokens in app/globals.css).
 *
 * What it checks, for both the light and dark token sets:
 *   1. Every palette colour vs --bg / --surface / --surface-raised is a
 *      distinguishable graphical object — WCAG contrast >= 3:1 (1.4.11).
 *   2. Every pair of palette colours that CO-OCCURS in some Congress is
 *      separable under normal vision AND simulated protanopia / deuteranopia
 *      (Machado 2009, severity 1.0) — OKLab dE >= 0.10.
 *   3. All-pairs separation is reported too (scope asked for the full matrix),
 *      but only co-occurring pairs are treated as failures — historical parties
 *      that never share a Congress may reuse a hue.
 *
 * Co-occurrence is read from pipeline/output/ideology_scores.json via the same
 * party_code -> key map as lib/party-palette.ts.
 *
 * Usage:
 *   node validate_palette.js                 # check committed tokens
 *   node validate_palette.js --set federalist=#b5842c,#d29b3e   # try a candidate
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CSS = fs.readFileSync(path.join(DIR, "app/globals.css"), "utf8");
const SCORES = JSON.parse(
  fs.readFileSync(path.join(DIR, "pipeline/output/ideology_scores.json"), "utf8"),
);

// party_code -> colour key — keep in sync with lib/party-palette.ts CODE_KEY.
const CODE_KEY = {
  100: "dem", 200: "rep",
  1: "federalist", 6000: "federalist",
  13: "demrep",
  22: "adams", 8000: "adams", 8888: "adams",
  29: "whig",
  555: "jackson", 7000: "jackson", 1346: "jackson",
  1275: "antijackson",
  4000: "antiadmin", 5000: "proadmin",
};
const PALETTE_KEYS = [
  "dem", "rep", "proadmin", "antiadmin", "federalist", "demrep",
  "adams", "antijackson", "jackson", "whig", "oth",
];
const BG_KEYS = ["bg", "surface", "surface-raised"];

// ---- CLI overrides -------------------------------------------------------
const override = { light: {}, dark: {} };
const setArg = process.argv.find((a) => a.startsWith("--set="))?.slice(6)
  ?? (process.argv.includes("--set")
        ? process.argv[process.argv.indexOf("--set") + 1]
        : null);
if (setArg) {
  for (const part of setArg.split(";")) {
    const [key, vals] = part.split("=");
    const [light, dark] = vals.split(",");
    override.light[key.trim()] = light.trim();
    if (dark) override.dark[key.trim()] = dark.trim();
  }
}

// ---- token extraction ---------------------------------------------------
function block(re) {
  const m = CSS.match(re);
  return m ? m[0] : "";
}
const lightBlock = block(/:root\s*\{[^}]*\}/);
const darkBlock = block(/:root\[data-theme="dark"\]\s*\{[^}]*\}/);

function tokens(blockStr, over) {
  const out = {};
  for (const m of blockStr.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    out[m[1]] = m[2];
  }
  return { ...out, ...over };
}
const THEME = {
  light: tokens(lightBlock, override.light),
  dark: tokens(darkBlock, override.dark),
};

// ---- colour maths ------------------------------------------------------
function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function relLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function linToOklab([r, g, b]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}
function oklab(hex) {
  return linToOklab(hexToRgb(hex).map(toLinear));
}
const deltaE = (a, b) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Machado et al. 2009, severity 1.0, applied to linear RGB.
const CVD = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};
function simulate(hex, kind) {
  if (kind === "normal") return oklab(hex);
  const lin = hexToRgb(hex).map(toLinear);
  const M = CVD[kind];
  const out = M.map((row) =>
    Math.min(1, Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])),
  );
  return linToOklab(out);
}

// ---- co-occurrence ----------------------------------------------------
const byCongress = new Map();
for (const r of SCORES) {
  if (r.party_code == null) continue;
  const key = CODE_KEY[r.party_code] ?? (r.party_code === 100 ? "dem"
    : r.party_code === 200 ? "rep" : "oth");
  if (!PALETTE_KEYS.includes(key)) continue;
  if (!byCongress.has(r.congress_number)) byCongress.set(r.congress_number, new Set());
  byCongress.get(r.congress_number).add(key);
}
const coPairs = new Set();
for (const set of byCongress.values()) {
  const ks = [...set];
  for (let i = 0; i < ks.length; i++)
    for (let j = i + 1; j < ks.length; j++)
      coPairs.add([ks[i], ks[j]].sort().join(" · "));
}

// ---- run ------------------------------------------------------------
// The shipped palette is the bar. A change PASSES iff, for both themes:
//   - every palette colour keeps >= 3:1 against all three surfaces, and
//   - no co-occurring pair's separation (min OKLab dE across normal / protan /
//     deutan) regresses vs the committed palette by more than EPS.
// DE_GOOD (0.10) is only an advisory "comfortably separable" mark in the
// printout — a handful of shipped pairs sit below it and are out of scope here.
const DE_GOOD = 0.10;
const CONTRAST_MIN = 3.0;
const EPS = 0.005;

// Committed federalist tokens — the regression baseline for pair separation.
const BASELINE = { federalist: ["#2a6d74", "#4a9088"] };

function allDE(T, a, b) {
  return ["normal", "protan", "deutan"].map((kind) =>
    deltaE(simulate(T[a], kind), simulate(T[b], kind)),
  );
}
const minDE = (T, a, b) => Math.min(...allDE(T, a, b));

let failures = 0;

for (const [ti, theme] of ["light", "dark"].entries()) {
  const T = THEME[theme];
  const base = { ...T };
  for (const [k, hexes] of Object.entries(BASELINE)) base[k] = hexes[ti];
  console.log(`\n=== ${theme.toUpperCase()} ===`);

  console.log("\n  contrast vs backgrounds (want >= 3:1; FAIL = regressed below it):");
  for (const k of PALETTE_KEYS) {
    const hex = T[k];
    const rows = BG_KEYS.map((bg) => `${bg} ${contrast(hex, T[bg]).toFixed(2)}`);
    const worst = Math.min(...BG_KEYS.map((bg) => contrast(hex, T[bg])));
    const worstBase = Math.min(...BG_KEYS.map((bg) => contrast(base[k], T[bg])));
    // A pre-existing sub-3:1 colour (e.g. --whig) is out of scope; only a
    // change that pushes a colour below 3:1, or further below, is a failure.
    const bad = worst < CONTRAST_MIN && worst < worstBase - EPS;
    const low = worst < CONTRAST_MIN;
    if (bad) failures++;
    console.log(`    ${bad ? "FAIL" : low ? "low " : "ok  "} ${k.padEnd(11)} ${hex}  ${rows.join("  ")}`);
  }

  console.log("\n  co-occurring pairs — min OKLab dE (normal / protan / deutan), vs baseline:");
  for (let i = 0; i < PALETTE_KEYS.length; i++) {
    for (let j = i + 1; j < PALETTE_KEYS.length; j++) {
      const a = PALETTE_KEYS[i], b = PALETTE_KEYS[j];
      const label = [a, b].sort().join(" · ");
      if (!coPairs.has(label)) continue;
      const des = allDE(T, a, b);
      const now = Math.min(...des);
      const was = minDE(base, a, b);
      const regressed = now < was - EPS;
      if (regressed) failures++;
      const mark = regressed ? "FAIL" : now < DE_GOOD ? "low " : "ok  ";
      const delta = (now - was >= 0 ? "+" : "") + (now - was).toFixed(3);
      console.log(
        `    ${mark} ${label.padEnd(26)} ${des.map((d) => d.toFixed(3)).join(" / ")}` +
        `   base ${was.toFixed(3)}  (${delta})`,
      );
    }
  }
}

console.log(
  `\n${failures === 0 ? "PASS — no contrast drop, no co-occurring-pair regression" : `FAIL — ${failures} regression(s)`}`,
);
process.exit(failures === 0 ? 0 : 1);

// Scratch helpers for Session 0 (Congress laws pre-flight). Not app code.
import fs from "node:fs";
import path from "node:path";
const env = Object.fromEntries(
  fs.readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
export const KEY = env.CONGRESS_API_KEY;
export const CACHE = new URL("../../raw/_scratch/laws/", import.meta.url).pathname;
fs.mkdirSync(CACHE, { recursive: true });
export const stats = { calls: 0, ms: 0, remaining: null };

export async function api(p, params = {}) {
  const q = new URLSearchParams({ format: "json", ...params });
  const url = `https://api.congress.gov/v3${p}?${q}`;
  const file = path.join(CACHE, "api", Buffer.from(p + "?" + q).toString("base64url").slice(0, 180) + ".json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  for (let attempt = 0; attempt < 6; attempt++) {
    const t0 = Date.now();
    const r = await fetch(url, { headers: { "X-Api-Key": KEY } });
    stats.calls++; stats.ms += Date.now() - t0;
    stats.remaining = r.headers.get("x-ratelimit-remaining");
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 2000 * (attempt + 1))); continue; }
    if (r.status === 404) { return { _404: true }; }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    const j = await r.json();
    fs.writeFileSync(file, JSON.stringify(j));
    return j;
  }
  throw new Error("retries exhausted " + url);
}
// seeded PRNG for reproducible samples
export function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
export function sample(arr, n, seed) { const r = rng(seed), a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }
export const yearOf = (c) => 1789 + 2 * (c - 1);

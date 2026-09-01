import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const alt = `${site.name} — DW-NOMINATE ideology scores`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#14161c";
const SURFACE = "#1b1e26";
const INK = "#e9eaee";
const INK_MUTED = "#9aa2af";
const ACCENT = "#9b84c7";
const DEM = "#4c7fdb";
const REP = "#d96a56";

// Deterministic pseudo-random so the image is byte-stable across builds.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export default function OpengraphImage() {
  // A decorative scatter: a left-leaning blue cluster, a right-leaning red one.
  const rand = rng(20250901);
  const dots = Array.from({ length: 40 }, (_, i) => {
    const rep = i % 2 === 0;
    const cx = rep ? 0.62 + rand() * 0.22 : 0.16 + rand() * 0.22;
    const cy = 0.15 + rand() * 0.7;
    return { rep, cx, cy };
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 24,
              letterSpacing: 4,
              color: ACCENT,
              fontWeight: 600,
            }}
          >
            DW-NOMINATE · U.S. CONGRESS
          </div>
          <div
            style={{
              fontSize: 92,
              color: INK,
              fontWeight: 700,
              marginTop: 12,
              lineHeight: 1.05,
            }}
          >
            {site.name}
          </div>
          <div
            style={{
              fontSize: 34,
              color: INK_MUTED,
              marginTop: 20,
              maxWidth: 900,
              lineHeight: 1.35,
            }}
          >
            Every member of Congress&rsquo;s votes reduced to a point in ideology
            space — 1st to 119th Congress, 1789 to today.
          </div>
        </div>

        <div
          style={{
            position: "relative",
            height: 150,
            background: SURFACE,
            borderRadius: 14,
            display: "flex",
          }}
        >
          {dots.map((d, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 24 + d.cx * (1200 - 144 - 48),
                top: 12 + d.cy * 126,
                width: 12,
                height: 12,
                borderRadius: 12,
                background: d.rep ? REP : DEM,
              }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}

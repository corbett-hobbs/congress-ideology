import { ImageResponse } from "next/og";
import { getCurrentMembers, getMemberProfile } from "@/lib/congress-data";
import { memberSlug } from "@/lib/member-url";
import { site } from "@/lib/site";

export const alt = "U.S. representative ideology score";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getCurrentMembers("house").map((m) => ({
    bioguide_id: m.bioguideId,
    name_slug: memberSlug(m),
  }));
}

const BG = "#14161c";
const SURFACE = "#1b1e26";
const LINE = "#3a4050";
const INK = "#e9eaee";
const INK_MUTED = "#9aa2af";
const ACCENT = "#9b84c7";
const GROUP_COLOR = { dem: "#4c7fdb", rep: "#d96a56", other: "#aba593" } as const;

export default async function Image({
  params,
}: {
  params: Promise<{ bioguide_id: string }>;
}) {
  const { bioguide_id } = await params;
  const profile = getMemberProfile("house", bioguide_id);

  if (!profile) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: BG,
            color: INK,
            fontSize: 48,
            fontFamily: "sans-serif",
          }}
        >
          {site.name}
        </div>
      ),
      size,
    );
  }

  const dim1 = profile.currentDim1 ?? profile.careerDim1;
  const color = GROUP_COLOR[profile.group];
  const seat =
    profile.district != null
      ? `${profile.state}-${profile.district}`
      : `${profile.state} at-large`;
  const BAR_W = 1056;
  const dotLeft = dim1 == null ? null : ((dim1 + 1) / 2) * BAR_W;

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
            U.S. REPRESENTATIVE
          </div>
          <div
            style={{
              fontSize: 88,
              color: INK,
              fontWeight: 700,
              marginTop: 12,
              lineHeight: 1.05,
            }}
          >
            {profile.name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 34,
              color: INK_MUTED,
              marginTop: 18,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 20,
                background: color,
              }}
            />
            {profile.party} · {seat}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              position: "relative",
              width: BAR_W,
              height: 20,
              background: SURFACE,
              borderRadius: 10,
              border: `1px solid ${LINE}`,
              display: "flex",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: BAR_W / 2 - 1,
                top: -6,
                width: 2,
                height: 32,
                background: LINE,
              }}
            />
            {dotLeft != null && (
              <div
                style={{
                  position: "absolute",
                  left: dotLeft - 16,
                  top: -6,
                  width: 32,
                  height: 32,
                  borderRadius: 32,
                  background: color,
                  border: `3px solid ${BG}`,
                }}
              />
            )}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              width: BAR_W,
              fontSize: 22,
              color: INK_MUTED,
            }}
          >
            <span>← more liberal</span>
            <span>DW-NOMINATE dimension 1 · {site.name}</span>
            <span>more conservative →</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

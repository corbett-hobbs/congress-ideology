import { ImageResponse } from "next/og";
import { getCommitteeProfile } from "@/lib/committee-data";
import { site } from "@/lib/site";

export const alt = "Congressional committee ideology score";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Rendered on first request and then cached (49 committees, link previews are
// rarely the first hit) — same approach as the member OG images.

const BG = "#14161c";
const SURFACE = "#1b1e26";
const LINE = "#3a4050";
const INK = "#e9eaee";
const INK_MUTED = "#9aa2af";
const ACCENT = "#9b84c7";
const GROUP_COLOR = { dem: "#4c7fdb", rep: "#d96a56", other: "#aba593" } as const;

const EYEBROW = {
  house: "HOUSE COMMITTEE",
  senate: "SENATE COMMITTEE",
  joint: "JOINT COMMITTEE",
} as const;

export default async function Image({
  params,
}: {
  params: Promise<{ committee_id: string }>;
}) {
  const { committee_id } = await params;
  const committee = getCommitteeProfile(committee_id);

  if (!committee) {
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

  const dim1 = committee.dim1;
  const color =
    committee.chamber === "joint"
      ? GROUP_COLOR.other
      : GROUP_COLOR[committee.controlGroup];
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
            {EYEBROW[committee.chamber]}
          </div>
          <div
            style={{
              fontSize: 76,
              color: INK,
              fontWeight: 700,
              marginTop: 12,
              lineHeight: 1.05,
            }}
          >
            {committee.name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 32,
              color: INK_MUTED,
              marginTop: 18,
            }}
          >
            <div
              style={{ width: 20, height: 20, borderRadius: 20, background: color }}
            />
            {committee.repCount} R / {committee.demCount} D · {committee.memberCount}{" "}
            members
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
            <span>blended DW-NOMINATE dimension 1 · {site.name}</span>
            <span>more conservative →</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

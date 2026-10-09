import { ImageResponse } from "next/og";
import { getLawPage } from "@/lib/law-details-data";
import { longDate } from "@/lib/law-details-derive";
import { ordinal } from "@/lib/laws-entities";
import { site } from "@/lib/site";

export const alt = "A U.S. public law";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Rendered on first request and then cached: there are 12k laws and link previews are rarely the first hit.

const BG = "#14161c";
const INK = "#e9eaee";
const INK_MUTED = "#9aa2af";
const ACCENT = "#9b84c7";

export default async function Image({ params }: { params: Promise<{ law_id: string }> }) {
  const { law_id } = await params;
  const law = getLawPage(law_id);

  if (!law) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BG, color: INK, fontSize: 48, fontFamily: "sans-serif" }}>{site.name}</div>,
      size,
    );
  }

  const title = law.title.length > 150 ? `${law.title.slice(0, 147)}…` : law.title;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: BG, padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 24, letterSpacing: 4, color: ACCENT, fontWeight: 600 }}>{law.publicLaw.toUpperCase()}</div>
          <div style={{ fontSize: title.length > 90 ? 48 : 64, color: INK, fontWeight: 700, marginTop: 14, lineHeight: 1.1 }}>{title}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: INK_MUTED }}>
          <span>
            {law.billLabel} · {ordinal(law.congress)} Congress · {longDate(law.date)}
          </span>
          <span>{site.name}</span>
        </div>
      </div>
    ),
    size,
  );
}

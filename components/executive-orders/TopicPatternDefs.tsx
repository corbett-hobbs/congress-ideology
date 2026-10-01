import { EO_TOPICS, TOPIC_STYLE, type EoTopic } from "@/lib/executive-orders-types";

/**
 * The `<pattern>` fills the hatch / dots topics reference (`url(#eo-pat-<topic>)`,
 * see `topicFill`). Render ONCE per page, in a zero-size svg — ids must be
 * unique in the document, and the chart, legend swatches and list chips all
 * point at these. Colours come from the `--topic-*` tokens, so they follow the
 * light/dark theme.
 */
export function TopicPatternDefs() {
  return (
    <svg width="0" height="0" aria-hidden focusable="false" style={{ position: "absolute" }}>
      <defs>
        {EO_TOPICS.map((t: EoTopic) => {
          const { family, fill } = TOPIC_STYLE[t];
          const color = `var(--topic-${family})`;
          if (fill === "hatch") {
            return (
              <pattern key={t} id={`eo-pat-${t}`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                <rect width="5" height="5" style={{ fill: "var(--surface)" }} />
                <rect width="2.4" height="5" style={{ fill: color }} />
              </pattern>
            );
          }
          if (fill === "dots") {
            return (
              <pattern key={t} id={`eo-pat-${t}`} patternUnits="userSpaceOnUse" width="5" height="5">
                <rect width="5" height="5" style={{ fill: "var(--surface)" }} />
                <circle cx="2.5" cy="2.5" r="1.45" style={{ fill: color }} />
              </pattern>
            );
          }
          return null;
        })}
      </defs>
    </svg>
  );
}

/** A small square in a topic's fill — legend, tooltip and list chips. */
export function TopicSwatch({ topic, size = 12, backed = false }: { topic: EoTopic; size?: number; backed?: boolean }) {
  const { family, fill } = TOPIC_STYLE[topic];
  return (
    <svg
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      // `backed`: on the tooltip's inverted background, give the swatch its own surface plate.
      className={`flex-none ${backed ? "box-content rounded-[3px] bg-surface p-[2px]" : ""}`}
    >
      <rect
        width={size}
        height={size}
        rx="2"
        style={{
          fill: fill === "solid" ? `var(--topic-${family})` : `url(#eo-pat-${topic})`,
          stroke: `var(--topic-${family})`,
          strokeWidth: 1,
        }}
      />
    </svg>
  );
}

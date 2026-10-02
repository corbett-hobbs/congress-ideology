import type { EoTopic } from "@/lib/executive-orders-types";

/** A small square in a topic's fill — legend, tooltip and list chips. */
export function TopicSwatch({ topic, size = 12, backed = false }: { topic: EoTopic; size?: number; backed?: boolean }) {
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
          fill: `var(--topic-${topic})`,
        }}
      />
    </svg>
  );
}

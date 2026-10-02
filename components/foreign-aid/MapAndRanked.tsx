"use client";

import { useElementSize } from "@/lib/use-element-size";
import { useMediaQuery } from "@/lib/use-media-query";
import type { WorldMapFile } from "@/lib/foreign-aid-entities";
import { MapCard } from "./MapCard";
import { RankedCard } from "./RankedCard";

/**
 * The map and the ranked list as one row. Side by side (md+) the grid stretches both cards to the
 * map card's height, and the ranked list is absolutely positioned inside a `flex-1` wrapper, so its
 * length never drives the row (the pattern in components/senate/SenateExplorer.tsx). When the cards
 * stack, the ranked card is capped to the map card's measured height and its list scrolls inside.
 */
export function MapAndRanked({ map }: { map: WorldMapFile }) {
  const [mapRef, size] = useElementSize<HTMLElement>();
  const stacked = useMediaQuery("(max-width: 767px)");
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.5fr_1fr] md:items-stretch">
      <MapCard ref={mapRef} map={map} />
      <RankedCard style={stacked && size.height > 0 ? { height: size.height } : undefined} />
    </div>
  );
}

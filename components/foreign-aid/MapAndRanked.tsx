"use client";

import type { WorldMapFile } from "@/lib/foreign-aid-entities";
import { MapCard } from "./MapCard";
import { RankedCard } from "./RankedCard";

/**
 * The map and the ranked list as one row. Side by side (md+) the grid stretches both cards to the
 * map card's height, and the ranked list is absolutely positioned inside a `flex-1` wrapper, so its
 * length never drives the row (the pattern in components/senate/SenateExplorer.tsx). When the cards
 * stack, the ranked list is a fixed 28rem box (about 10 rows) that scrolls inside the card.
 */
export function MapAndRanked({ map }: { map: WorldMapFile }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.5fr_1fr] md:items-stretch">
      <MapCard map={map} />
      <RankedCard />
    </div>
  );
}

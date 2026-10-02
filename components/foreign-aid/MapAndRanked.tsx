"use client";

import type { WorldMapFile } from "@/lib/foreign-aid-entities";
import { MapCard } from "./MapCard";

/**
 * "Where it goes, and who receives the most": the map and the ranked list are one card (`MapCard`)
 * sharing the Dollars / Military share toggle. Side by side (md+) the list stretches to the map
 * column's height and scrolls inside it; stacked, it is a fixed 28rem box.
 */
export function MapAndRanked({ map }: { map: WorldMapFile }) {
  return <MapCard map={map} />;
}

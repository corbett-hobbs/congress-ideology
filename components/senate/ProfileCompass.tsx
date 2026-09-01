"use client";

import { useRouter } from "next/navigation";
import type { ChamberMember } from "@/lib/congress-types";
import { memberPath } from "@/lib/member-url";
import { CompassChart } from "./CompassChart";

/**
 * The Session 3 compass, focused on one senator: their dot is ringed, the rest
 * of the chamber fades back, and clicking another dot opens that senator.
 */
export function ProfileCompass({
  members,
  bioguideId,
}: {
  members: ChamberMember[];
  bioguideId: string;
}) {
  const router = useRouter();
  return (
    <CompassChart
      variant="explorer"
      members={members}
      highlightedId={bioguideId}
      dimUnfocused
      onSelect={(m) => router.push(memberPath(m))}
    />
  );
}

import type { MetadataRoute } from "next";
import { getCurrentMembers } from "@/lib/congress-data";
import { CHAMBERS } from "@/lib/chamber";
import { memberPath } from "@/lib/member-url";
import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const profiles = CHAMBERS.flatMap((chamber) =>
    getCurrentMembers(chamber).map((m) => ({
      url: absoluteUrl(
        memberPath({ bioguideId: m.bioguideId, chamber, name: m.name }),
      ),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  );

  return [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...profiles,
  ];
}

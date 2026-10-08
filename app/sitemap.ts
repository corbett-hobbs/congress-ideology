import type { MetadataRoute } from "next";
import { getCurrentMembers } from "@/lib/congress-data";
import { getAllCommittees } from "@/lib/committee-data";
import { CHAMBERS } from "@/lib/chamber";
import { memberPath } from "@/lib/member-url";
import { committeePath } from "@/lib/committee-url";
import { getJusticeRefs } from "@/lib/justice-data";
import { justicePath } from "@/lib/justice-url";
import { liveSections } from "@/lib/verticals";
import { absoluteUrl } from "@/lib/site";
import { STATIC_PAGES } from "@/lib/site-info";

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

  const committees = getAllCommittees().map((c) => ({
    url: absoluteUrl(committeePath(c)),
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const justices = getJusticeRefs().map((j) => ({
    url: absoluteUrl(justicePath(j)),
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...liveSections().map((s) => ({
      url: absoluteUrl(s.href),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    ...STATIC_PAGES.map((path) => ({
      url: absoluteUrl(path),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...profiles,
    ...committees,
    ...justices,
  ];
}

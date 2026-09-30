import type { MetadataRoute } from "next";
import { getCurrentMembers } from "@/lib/congress-data";
import { getAllCommittees } from "@/lib/committee-data";
import { CHAMBERS } from "@/lib/chamber";
import { memberPath } from "@/lib/member-url";
import { committeePath } from "@/lib/committee-url";
import { branches } from "@/lib/verticals";
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

  const committees = getAllCommittees().map((c) => ({
    url: absoluteUrl(committeePath(c)),
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
    {
      url: absoluteUrl("/congress"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/congress/wealth"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...branches
      .filter((b) => b.status === "live" && b.id !== "congress")
      .map((b) => ({
        url: absoluteUrl(b.href),
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.9,
      })),
    ...profiles,
    ...committees,
  ];
}

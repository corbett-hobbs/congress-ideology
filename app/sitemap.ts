import type { MetadataRoute } from "next";
import { getCurrentSenators } from "@/lib/senate-data";
import { senatorPath } from "@/lib/senator-url";
import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...getCurrentSenators().map((s) => ({
      url: absoluteUrl(senatorPath(s)),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}

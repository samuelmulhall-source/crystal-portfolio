import type { MetadataRoute } from "next";
import { getSiteSettings, getWorkEntries } from "./lib/content";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteSettings();
  const now = new Date();
  const workEntries = getWorkEntries();

  return [
    {
      url: site.deployment.siteUrl,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${site.deployment.siteUrl}/work`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    ...workEntries.map((entry) => ({
      url: `${site.deployment.siteUrl}/work/${entry.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: entry.featured ? 0.8 : 0.7,
    })),
  ];
}

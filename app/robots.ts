import type { MetadataRoute } from "next";
import { getSiteSettings } from "./lib/content";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const site = getSiteSettings();

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${site.deployment.siteUrl}/sitemap.xml`,
  };
}

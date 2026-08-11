import type { MetadataRoute } from "next";
import { SITE_URL, IS_PUBLIC_SITE } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  // dev.circuvent.com and PR previews serve the same pages as production. If
  // they were crawlable they would compete with the real site in search and
  // expose unreleased work, so non-production deployments refuse everything.
  if (!IS_PUBLIC_SITE) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/", "/admin", "/logistics", "/shop/account", "/shop/devices", "/shop/invoice"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

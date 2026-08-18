import type { MetadataRoute } from "next";
import { blogPosts } from "@/lib/blog-data";
import { projects } from "@/lib/projects-data";
import { domains } from "@/lib/domains-data";
import { careerRoles } from "@/lib/services-data";
import { products as shopProducts } from "@/lib/shop-data";
import { catalogueCategories, categoryPath } from "@/lib/shop-categories";
import { SITE_URL } from "@/lib/config";

/**
 * `lastModified` is only set where a real date exists.
 *
 * It used to be `new Date()` for almost every URL, which told Google that the
 * entire site — terms, warranty, every project page — changed at the moment of
 * the last deploy. Google calibrates how much it trusts lastmod per site, and a
 * feed where everything always changed is a feed it learns to ignore, taking
 * the entries that *are* accurate down with it. Omitting the field is
 * well-defined and strictly better than asserting something false.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/shop`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/projects`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/services`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/team`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/careers`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/open-source`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/stack`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/architecture`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/case-studies`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/roadmap`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/docs`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/domains`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/shipping`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/returns-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/warranty`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Shop product detail pages
  const shopPages: MetadataRoute.Sitemap = shopProducts.map((p) => ({
    url: `${SITE_URL}/shop/${p.slug}`,
    changeFrequency: "weekly" as const,
    priority: p.featured ? 0.8 : 0.6,
  }));

  /*
   * Category listings.
   *
   * These are new URLs — categories used to be a query string on /shop, which
   * is not a form worth submitting for indexing and was never listed here.
   * Now that each one is a real prerendered page it earns an entry: ranked
   * below /shop itself, above an individual product, because a category is the
   * page a search like "smart lock india" should land on.
   *
   * Derived from the static catalogue, like the product pages above, so the
   * sitemap stays a pure synchronous function. Admin-only categories are
   * absent by the same token; they are reachable and indexable, just not
   * advertised here until they ship in the catalogue.
   */
  const categoryPages: MetadataRoute.Sitemap = catalogueCategories(shopProducts).map((c) => ({
    url: `${SITE_URL}${categoryPath(c)}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Blog posts — the one collection that carries a genuine publication date.
  const blogPages: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.date,
    changeFrequency: "monthly" as const,
    priority: post.featured ? 0.8 : 0.6,
  }));

  // Project detail pages
  const projectPages: MetadataRoute.Sitemap = projects.map((project) => ({
    url: `${SITE_URL}/projects/${project.id}`,
    changeFrequency: "monthly" as const,
    priority: project.featured ? 0.8 : 0.5,
  }));

  // Domain pages
  const domainPages: MetadataRoute.Sitemap = domains.map((domain) => ({
    url: `${SITE_URL}/domains/${domain.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // Career detail pages — dated from when the role was actually opened.
  const careerPages: MetadataRoute.Sitemap = careerRoles.map((role) => ({
    url: `${SITE_URL}/careers/${role.id}`,
    ...(role.datePosted ? { lastModified: role.datePosted } : {}),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [
    ...staticPages,
    ...shopPages,
    ...categoryPages,
    ...blogPages,
    ...projectPages,
    ...domainPages,
    ...careerPages,
  ];
}

import { blogPosts } from "@/lib/blog-data";

const SITE_URL = "https://circuvent.tech";
const SITE_NAME = "Circuvent Technologies";
const SITE_DESCRIPTION =
  "Engineering insights, architecture decisions, and lessons learned from building 53+ technology projects across AI, IoT, and full-stack.";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = [...blogPosts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const rssItems = posts
    .map(
      (post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${SITE_URL}/blog/${post.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${post.slug}</guid>
      <description>${escapeXml(post.excerpt)}</description>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <author>hello@circuvent.tech (${escapeXml(post.author)})</author>
      <category>${escapeXml(post.category)}</category>
      ${post.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join("\n      ")}
    </item>`
    )
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${SITE_NAME} Blog</title>
    <link>${SITE_URL}/blog</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <managingEditor>hello@circuvent.tech (Harsha Bonthada)</managingEditor>
    <webMaster>hello@circuvent.tech (Harsha Bonthada)</webMaster>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${SITE_URL}/icons/icon-192.png</url>
      <title>${SITE_NAME}</title>
      <link>${SITE_URL}</link>
    </image>
${rssItems}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}

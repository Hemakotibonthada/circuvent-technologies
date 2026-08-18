import { notFound } from "next/navigation";
import { getBlogPostBySlug, blogPosts } from "@/lib/blog-data";
import { ogImageResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Circuvent Technologies blog article";

/**
 * Pre-render a card per post at build time.
 *
 * Without this every article shares the site-wide default image, so twelve
 * different posts unfurl as twelve identical cards in a chat window -- and
 * BlogPosting has no per-article image to point at, which Article rich results
 * require.
 */
export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

/** Keeps a long headline from pushing the excerpt off the card. */
function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export default async function BlogOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  return ogImageResponse({
    product: "Blog",
    domain: "circuvent.com/blog",
    headline: clamp(post.title, 72),
    description: `${post.category} · ${post.readTime} · ${post.author}`,
    accent: "#0a1b44",
  });
}
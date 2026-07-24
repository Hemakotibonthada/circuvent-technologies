import type { Metadata } from "next";
import { getBlogPostBySlug } from "@/lib/blog-data";
import { generateBlogPostMetadata, getBlogPostJsonLd, getBreadcrumbJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return { title: "Article", robots: { index: false, follow: true } };
  return generateBlogPostMetadata({
    title: post.title,
    excerpt: post.excerpt,
    slug: post.slug,
    author: post.author,
    date: post.date,
    tags: post.tags,
    category: post.category,
  });
}

export default async function BlogPostLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  return (
    <>
      {post && (
        <JsonLd
          data={[
            getBlogPostJsonLd({
              title: post.title,
              excerpt: post.excerpt,
              slug: post.slug,
              author: post.author,
              date: post.date,
              readTime: post.readTime,
              category: post.category,
            }),
            getBreadcrumbJsonLd([
              { name: "Home", url: "/" },
              { name: "Blog", url: "/blog" },
              { name: post.title, url: `/blog/${post.slug}` },
            ]),
          ]}
        />
      )}
      {children}
    </>
  );
}

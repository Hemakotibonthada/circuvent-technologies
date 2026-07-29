"use client";

import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";
import BlogCard from "@/components/BlogCard";
import Newsletter from "@/components/Newsletter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBlogPostBySlug, getRelatedPosts } from "@/lib/blog-data";
import {
  ArrowLeft,
  Clock,
  Calendar,
  Share2,
  Twitter,
  Linkedin,
  Link as LinkIcon,
  ChevronUp,
} from "lucide-react";
import { useState, useEffect } from "react";

export default function BlogPostPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const post = getBlogPostBySlug(slug);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [readProgress, setReadProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 500);

      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height =
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight;
      const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
      setReadProgress(scrolled);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!post) {
    notFound();
  }

  const relatedPosts = getRelatedPosts(slug, 3);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `${post.title} by ${post.author}`;

  const handleCopyLink = async () => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
    }
  };

  // Simple markdown-like rendering for the content
  const renderContent = (content: string) => {
    const lines = content.trim().split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeBlockLang = "";
    let key = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code block start/end
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          elements.push(
            <div
              key={key++}
              className="my-6 rounded-xl overflow-hidden"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-primary)",
              }}
            >
              {codeBlockLang && (
                <div
                  className="px-4 py-2 text-xs font-mono"
                  style={{
                    background: "var(--bg-elevated)",
                    borderBottom: "1px solid var(--border-primary)",
                    color: "var(--text-muted)",
                  }}
                >
                  {codeBlockLang}
                </div>
              )}
              <pre className="p-4 overflow-x-auto text-xs sm:text-sm leading-relaxed">
                <code style={{ color: "var(--text-secondary)" }}>
                  {codeBlockContent.join("\n")}
                </code>
              </pre>
            </div>
          );
          inCodeBlock = false;
          codeBlockContent = [];
          codeBlockLang = "";
        } else {
          inCodeBlock = true;
          codeBlockLang = line.replace("```", "").trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      // Empty line
      if (line.trim() === "") {
        continue;
      }

      // Headers
      if (line.startsWith("### ")) {
        elements.push(
          <h3
            key={key++}
            className="text-xl font-bold mt-10 mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            {line.replace("### ", "")}
          </h3>
        );
        continue;
      }

      if (line.startsWith("## ")) {
        elements.push(
          <h2
            key={key++}
            className="text-2xl sm:text-3xl font-bold mt-12 mb-6"
            style={{ color: "var(--text-primary)" }}
          >
            {line.replace("## ", "")}
          </h2>
        );
        continue;
      }

      // List items
      if (line.startsWith("- ")) {
        elements.push(
          <li
            key={key++}
            className="text-sm sm:text-base leading-relaxed ml-4 mb-2 list-disc"
            style={{ color: "var(--text-tertiary)" }}
          >
            {renderInlineCode(line.replace("- ", ""))}
          </li>
        );
        continue;
      }

      // Numbered list
      if (/^\d+\.\s/.test(line)) {
        elements.push(
          <li
            key={key++}
            className="text-sm sm:text-base leading-relaxed ml-4 mb-2 list-decimal"
            style={{ color: "var(--text-tertiary)" }}
          >
            {renderInlineCode(line.replace(/^\d+\.\s/, ""))}
          </li>
        );
        continue;
      }

      // Blockquote
      if (line.startsWith("> ")) {
        elements.push(
          <blockquote
            key={key++}
            className="my-6 pl-4 py-2 text-lg italic"
            style={{
              borderLeft: "3px solid var(--accent-cyan)",
              color: "var(--text-secondary)",
            }}
          >
            {line.replace("> ", "")}
          </blockquote>
        );
        continue;
      }

      // Table-like content
      if (line.startsWith("|")) {
        elements.push(
          <div
            key={key++}
            className="my-4 overflow-x-auto text-xs sm:text-sm font-mono"
            style={{ color: "var(--text-tertiary)" }}
          >
            {line}
          </div>
        );
        continue;
      }

      // Regular paragraph
      elements.push(
        <p
          key={key++}
          className="text-sm sm:text-base leading-relaxed mb-4"
          style={{ color: "var(--text-tertiary)" }}
        >
          {renderInlineCode(line)}
        </p>
      );
    }

    return elements;
  };

  const renderInlineCode = (text: string): React.ReactNode => {
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 rounded text-xs font-mono"
            style={{
              background: "var(--accent-cyan-muted)",
              color: "var(--text-secondary)",
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      // Handle bold
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((bp, j) => {
        if (bp.startsWith("**") && bp.endsWith("**")) {
          return (
            <strong key={`${i}-${j}`} style={{ color: "var(--text-primary)" }}>
              {bp.slice(2, -2)}
            </strong>
          );
        }
        return bp;
      });
    });
  };

  return (
    <>

      {/* Reading progress bar */}
      <div className="fixed top-0 left-0 right-0 z-[60] h-1">
        <motion.div
          className="h-full bg-gradient-to-r from-cyan-500 to-violet-500"
          style={{ width: `${readProgress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Back link */}
      <section className="relative z-10 pt-28 pb-4">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm transition-colors hover:text-[var(--accent-cyan)]"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Link>
        </div>
      </section>

      {/* Article Header */}
      <section className="relative z-10 pb-8">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="flex flex-wrap gap-2 mb-6">
              <Badge variant="primary">{post.category}</Badge>
              {post.featured && <Badge variant="success">Featured</Badge>}
            </div>

            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {post.title}
            </h1>

            <p
              className="text-lg leading-relaxed mb-8"
              style={{ color: "var(--text-tertiary)" }}
            >
              {post.excerpt}
            </p>

            {/* Meta row */}
            <div
              className="flex flex-wrap items-center gap-6 pb-8"
              style={{ borderBottom: "1px solid var(--border-primary)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{post.authorAvatar}</span>
                <div>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {post.author}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {post.authorRole}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                <Calendar className="w-4 h-4" />
                <span className="text-sm">
                  {new Date(post.date).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>

              <div className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                <Clock className="w-4 h-4" />
                <span className="text-sm">{post.readTime}</span>
              </div>

              {/* Share */}
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Share:
                </span>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--accent-cyan-muted)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Twitter className="w-4 h-4" />
                </a>
                <a
                  href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(post.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--accent-cyan-muted)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Linkedin className="w-4 h-4" />
                </a>
                <button
                  onClick={handleCopyLink}
                  className="p-2 rounded-lg transition-colors hover:bg-[var(--accent-cyan-muted)] cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                >
                  <LinkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Article Content */}
      <section className="relative z-10 py-8">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <article className="prose-custom">{renderContent(post.content)}</article>

          {/* Tags */}
          <div
            className="mt-12 pt-8 flex flex-wrap gap-2"
            style={{ borderTop: "1px solid var(--border-primary)" }}
          >
            <span className="text-sm font-medium mr-2" style={{ color: "var(--text-secondary)" }}>
              Tags:
            </span>
            {post.tags.map((tag) => (
              <Badge key={tag} variant="default">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="relative z-10 py-20">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <ScrollReveal>
              <h2
                className="text-2xl font-bold mb-8"
                style={{ color: "var(--text-primary)" }}
              >
                Related Articles
              </h2>
            </ScrollReveal>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedPosts.map((relatedPost, i) => (
                <BlogCard
                  key={relatedPost.slug}
                  post={relatedPost}
                  index={i}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Newsletter */}
      <section className="relative z-10 py-16">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <Newsletter />
        </div>
      </section>

      {/* Scroll to top */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-8 right-8 z-50 p-3 rounded-full cursor-pointer"
            style={{
              background: "var(--accent-cyan)",
              color: "white",
              boxShadow: "0 4px 20px rgba(6, 182, 212, 0.4)",
            }}
          >
            <ChevronUp className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}

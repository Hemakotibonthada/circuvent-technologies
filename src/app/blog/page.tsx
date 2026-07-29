"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import BlogCard from "@/components/BlogCard";
import Newsletter from "@/components/Newsletter";
import ScrollReveal from "@/components/ScrollReveal";
import {
  blogPosts,
  BLOG_CATEGORIES,
  getBlogPostsByCategory,
  getFeaturedBlogPosts,
  type BlogCategory,
} from "@/lib/blog-data";
import { Search, BookOpen, TrendingUp, Rss } from "lucide-react";

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState<BlogCategory>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const featured = getFeaturedBlogPosts();

  const filteredPosts = getBlogPostsByCategory(activeCategory).filter(
    (post) =>
      searchQuery === "" ||
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.tags.some((t) =>
        t.toLowerCase().includes(searchQuery.toLowerCase())
      ) ||
      post.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>

      <PageHeader
        eyebrow="Blog"
        title="Engineering"
        titleHighlight="Insights"
        description="Deep dives into our engineering decisions, architecture patterns, and lessons learned from building 53+ projects across AI, IoT, and full-stack."
      >
        <div className="flex flex-wrap gap-6 mt-8 pt-8" style={{ borderTop: "1px solid var(--border-primary)" }}>
          {[
            { icon: BookOpen, value: `${blogPosts.length}`, label: "Articles" },
            { icon: TrendingUp, value: `${featured.length}`, label: "Featured" },
            { icon: Rss, value: `${BLOG_CATEGORIES.length - 1}`, label: "Categories" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg"
                style={{ background: "var(--accent-cyan-muted)" }}
              >
                <stat.icon className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} />
              </div>
              <div>
                <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                  {stat.value}
                </div>
                <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  {stat.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </PageHeader>

      {/* Featured Posts */}
      <section className="relative z-10 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <h2 className="text-2xl font-bold mb-8" style={{ color: "var(--text-primary)" }}>
              Featured Articles
            </h2>
          </ScrollReveal>

          <div className="grid lg:grid-cols-2 gap-6">
            {featured.slice(0, 2).map((post, i) => (
              <BlogCard key={post.slug} post={post} index={i} variant="featured" />
            ))}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section
        className="relative z-30 sticky top-0 backdrop-blur-xl"
        style={{
          background: "var(--bg-primary)",
          borderBottom: "1px solid var(--border-primary)",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Category Pills — horizontal scroll on mobile, wrap on desktop */}
            <div className="-mx-6 flex items-center gap-1.5 overflow-x-auto px-6 no-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {BLOG_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all duration-300 cursor-pointer whitespace-nowrap"
                  style={
                    activeCategory === cat
                      ? {
                          background: "var(--accent-cyan-muted)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border-accent)",
                        }
                      : {
                          color: "var(--text-muted)",
                          border: "1px solid transparent",
                        }
                  }
                >
                  {cat}
                  {cat !== "All" && (
                    <span className="ml-1 text-[11px] opacity-50">
                      {getBlogPostsByCategory(cat).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-56 sm:shrink-0">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                placeholder="Search articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)] transition-all"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Article Grid */}
      <section className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory + searchQuery}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {filteredPosts.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredPosts.map((post, i) => (
                    <BlogCard key={post.slug} post={post} index={i} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <BookOpen
                    className="w-12 h-12 mx-auto mb-4 opacity-30"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <p className="text-lg" style={{ color: "var(--text-muted)" }}>
                    No articles match your search.
                  </p>
                  <button
                    onClick={() => {
                      setActiveCategory("All");
                      setSearchQuery("");
                    }}
                    className="mt-4 text-sm cursor-pointer"
                    style={{ color: "var(--accent-cyan)" }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div
            className="mt-8 text-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Showing {filteredPosts.length} of {blogPosts.length} articles
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="relative z-10 py-16">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <Newsletter />
        </div>
      </section>
    </>
  );
}

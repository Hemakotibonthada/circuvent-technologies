import {
  blogPosts,
  getBlogPostsByCategory,
  getFeaturedBlogPosts,
  getBlogPostBySlug,
  getRelatedPosts,
} from "@/lib/blog-data";

describe("Blog Data", () => {
  describe("blogPosts array", () => {
    it("has blog posts", () => {
      expect(blogPosts.length).toBeGreaterThan(0);
    });

    it("every post has required fields", () => {
      blogPosts.forEach((post) => {
        expect(post.slug).toBeTruthy();
        expect(post.title).toBeTruthy();
        expect(post.excerpt).toBeTruthy();
        expect(post.content).toBeTruthy();
        expect(post.author).toBeTruthy();
        expect(post.date).toBeTruthy();
        expect(post.readTime).toBeTruthy();
        expect(post.category).toBeTruthy();
        expect(post.tags.length).toBeGreaterThan(0);
        expect(post.coverGradient).toBeTruthy();
        expect(post.icon).toBeTruthy();
      });
    });

    it("has unique slugs", () => {
      const slugs = blogPosts.map((p) => p.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it("has valid dates", () => {
      blogPosts.forEach((post) => {
        const date = new Date(post.date);
        expect(date.getTime()).not.toBeNaN();
      });
    });
  });

  describe("getBlogPostsByCategory", () => {
    it("returns all posts for 'All'", () => {
      expect(getBlogPostsByCategory("All")).toEqual(blogPosts);
    });

    it("filters by category", () => {
      const engineeringPosts = getBlogPostsByCategory("Engineering");
      engineeringPosts.forEach((p) => {
        expect(p.category).toBe("Engineering");
      });
    });
  });

  describe("getFeaturedBlogPosts", () => {
    it("returns only featured posts", () => {
      const featured = getFeaturedBlogPosts();
      featured.forEach((p) => {
        expect(p.featured).toBe(true);
      });
    });
  });

  describe("getBlogPostBySlug", () => {
    it("finds post by slug", () => {
      const firstPost = blogPosts[0];
      const found = getBlogPostBySlug(firstPost.slug);
      expect(found).toBeDefined();
      expect(found?.slug).toBe(firstPost.slug);
    });

    it("returns undefined for non-existent slug", () => {
      expect(getBlogPostBySlug("non-existent-slug")).toBeUndefined();
    });
  });

  describe("getRelatedPosts", () => {
    it("returns related posts excluding the current one", () => {
      const firstPost = blogPosts[0];
      const related = getRelatedPosts(firstPost.slug, 3);
      expect(related.length).toBeLessThanOrEqual(3);
      related.forEach((p) => {
        expect(p.slug).not.toBe(firstPost.slug);
      });
    });

    it("respects the limit parameter", () => {
      const related = getRelatedPosts(blogPosts[0].slug, 2);
      expect(related.length).toBeLessThanOrEqual(2);
    });
  });
});

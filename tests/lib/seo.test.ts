import { generatePageMetadata, pageMetadata } from "@/lib/seo";

describe("SEO Utilities", () => {
  describe("pageMetadata", () => {
    it("has metadata for all expected pages", () => {
      const expectedPages = [
        "home", "projects", "services", "about", "team",
        "blog", "contact", "careers", "privacy", "openSource",
        "stack", "architecture", "caseStudies", "roadmap", "docs", "domains",
      ];

      expectedPages.forEach((page) => {
        expect(pageMetadata[page]).toBeDefined();
        expect(pageMetadata[page].title).toBeTruthy();
        expect(pageMetadata[page].description).toBeTruthy();
        expect(pageMetadata[page].path).toBeTruthy();
        expect(pageMetadata[page].keywords.length).toBeGreaterThan(0);
      });
    });
  });

  describe("generatePageMetadata", () => {
    it("generates metadata for a valid page", () => {
      const meta = generatePageMetadata("projects");
      expect(meta.title).toContain("Projects");
      expect(meta.description).toBeTruthy();
      expect(meta.openGraph).toBeDefined();
    });

    it("returns fallback for unknown page", () => {
      const meta = generatePageMetadata("nonexistent");
      expect(meta.title).toBe("Circuvent Technologies");
    });
  });
});

import { generatePageMetadata, pageMetadata, getProductJsonLd, getFAQJsonLd } from "@/lib/seo";

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
      expect((meta.title as { absolute: string }).absolute).toContain("Projects");
      expect(meta.description).toBeTruthy();
      expect(meta.openGraph).toBeDefined();
    });

    it("returns fallback for unknown page", () => {
      const meta = generatePageMetadata("nonexistent");
      expect(meta.title).toBe("Circuvent Technologies");
    });
  });

  describe("getProductJsonLd", () => {
    it("builds a schema.org Product with an in-stock offer + rating", () => {
      const ld = getProductJsonLd({
        name: "Circuvent Smart Plug",
        slug: "circuvent-smart-plug",
        description: "A Wi-Fi smart plug.",
        price: 999,
        image: "/img/plug.webp",
        rating: 4.6,
        reviewCount: 12,
        stock: 5,
        available: true,
      }) as Record<string, unknown>;
      expect(ld["@type"]).toBe("Product");
      const offer = ld.offers as Record<string, unknown>;
      expect(offer.price).toBe("999");
      expect(offer.priceCurrency).toBe("INR");
      expect(offer.availability).toBe("https://schema.org/InStock");
      expect((ld.aggregateRating as Record<string, unknown>).reviewCount).toBe(12);
    });

    it("marks out-of-stock and ignores data-URL images", () => {
      const ld = getProductJsonLd({
        name: "X",
        slug: "x",
        description: "d",
        price: 100,
        image: "data:image/png;base64,AAAA",
        stock: 0,
        available: true,
      }) as Record<string, unknown>;
      const offer = ld.offers as Record<string, unknown>;
      expect(offer.availability).toBe("https://schema.org/OutOfStock");
      // data-URL images are dropped in favour of the absolute OG fallback.
      expect((ld.image as string[])[0].startsWith("data:")).toBe(false);
    });
  });

  describe("getFAQJsonLd", () => {
    it("builds a FAQPage with question/answer entities", () => {
      const ld = getFAQJsonLd([{ question: "Q?", answer: "A." }]) as Record<string, unknown>;
      expect(ld["@type"]).toBe("FAQPage");
      const entities = ld.mainEntity as Array<Record<string, unknown>>;
      expect(entities).toHaveLength(1);
      expect(entities[0].name).toBe("Q?");
    });
  });
});

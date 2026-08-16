import {
  catalogueCategories,
  categoryFromSlug,
  categoryPath,
  categorySlug,
} from "./shop-categories";

const catalogue = [
  { category: "Safety" },
  { category: "Lighting" },
  { category: "Smart Lighting" },
  { category: "Safety" },
];

describe("categorySlug", () => {
  it("lowercases and hyphenates", () => {
    expect(categorySlug("Smart Lighting")).toBe("smart-lighting");
  });

  it("strips punctuation rather than percent-encoding it", () => {
    expect(categorySlug("Locks & Curtains")).toBe("locks-curtains");
  });

  it("collapses runs of separators", () => {
    expect(categorySlug("Smart   __ Home")).toBe("smart-home");
  });

  it("trims leading and trailing separators", () => {
    expect(categorySlug("  -Safety-  ")).toBe("safety");
  });

  it("returns empty for input with nothing slug-worthy", () => {
    expect(categorySlug("!!!")).toBe("");
  });
});

describe("catalogueCategories", () => {
  it("de-duplicates and sorts", () => {
    expect(catalogueCategories(catalogue)).toEqual(["Lighting", "Safety", "Smart Lighting"]);
  });

  it("drops empty categories rather than emitting a blank slug", () => {
    expect(catalogueCategories([{ category: "" }, { category: "Safety" }])).toEqual(["Safety"]);
  });

  it("is empty for an empty catalogue", () => {
    expect(catalogueCategories([])).toEqual([]);
  });
});

describe("categoryFromSlug", () => {
  it("resolves a slug to its original display name", () => {
    expect(categoryFromSlug(catalogue, "smart-lighting")).toBe("Smart Lighting");
  });

  it("resolves a simple single-word category", () => {
    expect(categoryFromSlug(catalogue, "safety")).toBe("Safety");
  });

  it("returns null for an unknown slug so the route can 404", () => {
    expect(categoryFromSlug(catalogue, "does-not-exist")).toBeNull();
  });

  it("returns null for an empty slug", () => {
    expect(categoryFromSlug(catalogue, "")).toBeNull();
  });

  it("tolerates a percent-encoded segment", () => {
    expect(categoryFromSlug(catalogue, "smart%20lighting")).toBe("Smart Lighting");
  });

  it("is case-insensitive about the incoming slug", () => {
    expect(categoryFromSlug(catalogue, "SAFETY")).toBe("Safety");
  });

  it("picks deterministically when two categories share a slug", () => {
    const collide = [{ category: "E Bikes" }, { category: "E-Bikes" }];
    expect(categoryFromSlug(collide, "e-bikes")).toBe("E Bikes");
  });

  it("returns null against an empty catalogue", () => {
    expect(categoryFromSlug([], "safety")).toBeNull();
  });
});

describe("categoryPath", () => {
  it("builds the canonical listing path", () => {
    expect(categoryPath("Smart Lighting")).toBe("/shop/c/smart-lighting");
  });

  it("round-trips through categoryFromSlug", () => {
    for (const c of catalogueCategories(catalogue)) {
      const slug = categoryPath(c).replace("/shop/c/", "");
      expect(categoryFromSlug(catalogue, slug)).toBe(c);
    }
  });
});

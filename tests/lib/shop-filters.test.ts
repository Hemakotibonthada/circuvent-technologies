import type { Product } from "@/lib/shop-data";
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  SORT_OPTIONS,
  activeChips,
  applyFilters,
  clearFilters,
  computeFacets,
  countActiveFilters,
  discountPct,
  isLowStock,
  isSoldOut,
  matchesQuery,
  parseFilters,
  priceBounds,
  removeChip,
  savingOf,
  selectProducts,
  serializeFilters,
  sortProducts,
  type FilterState,
} from "@/lib/shop-filters";

function make(overrides: Partial<Product> & Pick<Product, "id">): Product {
  return {
    slug: overrides.id,
    name: "Product",
    tagline: "A tagline",
    description: "A description",
    price: 1000,
    category: "Home Automation",
    accent: "#06b6d4",
    icon: "⚡",
    specs: ["Spec one", "Spec two"],
    stock: 10,
    rating: 4.5,
    ...overrides,
  } as Product;
}

const CATALOG: Product[] = [
  make({ id: "plug", name: "Smart Plug", price: 999, compareAt: 1499, rating: 4.8, stock: 25, featured: true }),
  make({ id: "aqua", name: "AquaGuard", price: 1999, compareAt: 2499, rating: 4.2, category: "Water Management", stock: 3 }),
  make({ id: "guard", name: "Guardian Beacon", price: 2999, rating: 3.9, category: "Safety", stock: 0 }),
  make({ id: "hub", name: "Home Hub", price: 2499, rating: 4.6, stock: 8, available: false }),
  make({ id: "light", name: "Smart Light", price: 899, compareAt: 1299, rating: 4.7, stock: 30, badge: "New" }),
];

const base = (patch: Partial<FilterState> = {}): FilterState => ({ ...DEFAULT_FILTERS, ...patch });

describe("shop-filters — product predicates", () => {
  it("treats zero stock and explicit unavailability as sold out", () => {
    expect(isSoldOut(CATALOG.find((p) => p.id === "guard")!)).toBe(true);
    expect(isSoldOut(CATALOG.find((p) => p.id === "hub")!)).toBe(true);
    expect(isSoldOut(CATALOG.find((p) => p.id === "plug")!)).toBe(false);
  });

  it("flags low stock only while the product is still purchasable", () => {
    expect(isLowStock(CATALOG.find((p) => p.id === "aqua")!)).toBe(true);
    expect(isLowStock(CATALOG.find((p) => p.id === "plug")!)).toBe(false);
    expect(isLowStock(CATALOG.find((p) => p.id === "guard")!)).toBe(false);
  });

  it("computes saving and discount only when compareAt is higher", () => {
    const plug = CATALOG.find((p) => p.id === "plug")!;
    expect(savingOf(plug)).toBe(500);
    expect(discountPct(plug)).toBe(33);

    const guard = CATALOG.find((p) => p.id === "guard")!;
    expect(savingOf(guard)).toBe(0);
    expect(discountPct(guard)).toBe(0);

    expect(savingOf(make({ id: "x", price: 1000, compareAt: 800 }))).toBe(0);
  });
});

describe("shop-filters — matchesQuery", () => {
  const plug = CATALOG.find((p) => p.id === "plug")!;

  it("matches an empty query", () => {
    expect(matchesQuery(plug, "   ")).toBe(true);
  });

  it("is case-insensitive and searches across fields", () => {
    expect(matchesQuery(plug, "SMART")).toBe(true);
    expect(matchesQuery(plug, "spec one")).toBe(true);
    expect(matchesQuery(plug, "home automation")).toBe(true);
  });

  it("requires every whitespace-separated term to match", () => {
    expect(matchesQuery(plug, "smart plug")).toBe(true);
    expect(matchesQuery(plug, "smart submarine")).toBe(false);
  });
});

describe("shop-filters — applyFilters", () => {
  it("returns everything by default", () => {
    expect(applyFilters(CATALOG, base())).toHaveLength(CATALOG.length);
  });

  it("filters by multiple categories as a union", () => {
    const out = applyFilters(CATALOG, base({ categories: ["Safety", "Water Management"] }));
    expect(out.map((p) => p.id).sort()).toEqual(["aqua", "guard"]);
  });

  it("filters by price range inclusively", () => {
    const out = applyFilters(CATALOG, base({ minPrice: 999, maxPrice: 2499 }));
    expect(out.map((p) => p.id).sort()).toEqual(["aqua", "hub", "plug"]);
  });

  it("filters out sold-out products for the in-stock facet", () => {
    const out = applyFilters(CATALOG, base({ inStock: true }));
    expect(out.map((p) => p.id).sort()).toEqual(["aqua", "light", "plug"]);
  });

  it("filters to discounted products for the on-sale facet", () => {
    const out = applyFilters(CATALOG, base({ onSale: true }));
    expect(out.map((p) => p.id).sort()).toEqual(["aqua", "light", "plug"]);
  });

  it("filters by minimum rating", () => {
    const out = applyFilters(CATALOG, base({ minRating: 4.5 }));
    expect(out.map((p) => p.id).sort()).toEqual(["hub", "light", "plug"]);
  });

  it("uses the injected wishlist predicate for the saved facet", () => {
    const out = applyFilters(CATALOG, base({ saved: true }), { isSaved: (id) => id === "hub" });
    expect(out.map((p) => p.id)).toEqual(["hub"]);
  });

  it("treats the saved facet as empty when no predicate is supplied", () => {
    expect(applyFilters(CATALOG, base({ saved: true }))).toHaveLength(0);
  });

  it("combines constraints conjunctively", () => {
    const out = applyFilters(CATALOG, base({ inStock: true, onSale: true, maxPrice: 1000 }));
    expect(out.map((p) => p.id).sort()).toEqual(["light", "plug"]);
  });
});

describe("shop-filters — sortProducts", () => {
  it("sorts by ascending and descending price", () => {
    expect(sortProducts(CATALOG, "price-asc")[0].id).toBe("light");
    expect(sortProducts(CATALOG, "price-desc")[0].id).toBe("guard");
  });

  it("sorts by rating and by discount", () => {
    expect(sortProducts(CATALOG, "rating")[0].id).toBe("plug");
    expect(sortProducts(CATALOG, "discount")[0].id).toBe("plug");
  });

  it("sorts by name alphabetically", () => {
    expect(sortProducts(CATALOG, "name").map((p) => p.name)[0]).toBe("AquaGuard");
  });

  it("pushes sold-out products to the end of the featured order", () => {
    const ids = sortProducts(CATALOG, "featured").map((p) => p.id);
    expect(ids[0]).toBe("plug");
    expect(ids.slice(-2).sort()).toEqual(["guard", "hub"]);
  });

  it("does not mutate the input array", () => {
    const input = [...CATALOG];
    sortProducts(input, "price-desc");
    expect(input.map((p) => p.id)).toEqual(CATALOG.map((p) => p.id));
  });
});

describe("shop-filters — selectProducts", () => {
  it("filters then sorts", () => {
    const out = selectProducts(CATALOG, base({ inStock: true, sort: "price-asc" }));
    expect(out.map((p) => p.id)).toEqual(["light", "plug", "aqua"]);
  });
});

describe("shop-filters — facets", () => {
  it("counts categories ignoring the category filter itself", () => {
    const facets = computeFacets(CATALOG, base({ categories: ["Safety"] }));
    const values = facets.categories.map((c) => c.value).sort();
    expect(values).toEqual(["Home Automation", "Safety", "Water Management"]);
    expect(facets.categories.find((c) => c.value === "Home Automation")!.count).toBe(3);
  });

  it("counts availability and offer facets against the other constraints", () => {
    const facets = computeFacets(CATALOG, base({ inStock: true }));
    expect(facets.inStock).toBe(3);
    expect(facets.onSale).toBe(3);
  });

  it("counts saved items via the injected predicate", () => {
    const facets = computeFacets(CATALOG, base(), { isSaved: (id) => id === "plug" || id === "hub" });
    expect(facets.saved).toBe(2);
  });

  it("drops empty price buckets and keeps populated ones", () => {
    const facets = computeFacets(CATALOG, base());
    const ids = facets.prices.map((b) => b.id);
    expect(ids).toContain("under-1000");
    expect(ids).toContain("2000-2999");
    expect(facets.prices.every((b) => b.count > 0)).toBe(true);
  });

  it("reports rating thresholds, and drops bands that cannot narrow anything", () => {
    const facets = computeFacets(CATALOG, base());
    // 3 of 5 are 4.5+, so this band is a real filter and survives.
    expect(facets.ratings.find((r) => r.value === 4.5)!.count).toBe(3);

    /*
     * Every product in the fixture is 3.5+, so selecting that band returns the
     * same list it was already showing. A band matching everything is as
     * useless as one matching nothing, and the price buckets above already
     * drop the empty case — this makes the two consistent.
     *
     * It is not hypothetical: the live catalogue is entirely 4.5+, so all
     * three bands showed the full count and the section occupied prime
     * sidebar space while being incapable of filtering.
     */
    expect(facets.ratings.find((r) => r.value === 3.5)).toBeUndefined();
    expect(facets.ratings.every((r) => r.count > 0 && r.count < CATALOG.length)).toBe(true);
  });
});

describe("shop-filters — priceBounds", () => {
  it("returns the catalog min and max", () => {
    expect(priceBounds(CATALOG)).toEqual({ min: 899, max: 2999 });
  });

  it("degrades safely on an empty catalog", () => {
    expect(priceBounds([])).toEqual({ min: 0, max: 0 });
  });
});

describe("shop-filters — active chips", () => {
  const fmt = (n: number) => `₹${n}`;

  it("produces one chip per applied constraint", () => {
    const state = base({
      q: "plug",
      categories: ["Safety", "Energy"],
      minPrice: 500,
      maxPrice: 2000,
      minRating: 4,
      inStock: true,
      onSale: true,
      saved: true,
    });
    expect(activeChips(state, fmt)).toHaveLength(8);
    expect(countActiveFilters(state)).toBe(8);
  });

  it("ignores sort and view when counting", () => {
    expect(countActiveFilters(base({ sort: "price-asc", view: "list" }))).toBe(0);
  });

  it("labels an open-ended price range", () => {
    const chip = activeChips(base({ minPrice: 1000 }), fmt).find((c) => c.id === "price");
    expect(chip!.label).toBe("₹1000 – Any");
  });

  it("removes only the targeted constraint", () => {
    const state = base({ categories: ["Safety", "Energy"], inStock: true });
    const next = removeChip(state, { kind: "category", value: "Safety" });
    expect(next.categories).toEqual(["Energy"]);
    expect(next.inStock).toBe(true);
  });

  it("clears both price bounds together", () => {
    const next = removeChip(base({ minPrice: 100, maxPrice: 900 }), { kind: "price" });
    expect(next.minPrice).toBeNull();
    expect(next.maxPrice).toBeNull();
  });

  it("keeps sort and view when clearing all filters", () => {
    const next = clearFilters(base({ q: "x", inStock: true, sort: "rating", view: "list" }));
    expect(next.q).toBe("");
    expect(next.inStock).toBe(false);
    expect(next.sort).toBe("rating");
    expect(next.view).toBe("list");
  });
});

describe("shop-filters — URL round-trip", () => {
  it("omits defaults so a clean URL stays clean", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe("");
  });

  it("round-trips a fully populated state", () => {
    const state = base({
      q: "smart plug",
      categories: ["Safety", "Energy"],
      minPrice: 500,
      maxPrice: 2500,
      minRating: 4.5,
      inStock: true,
      onSale: true,
      saved: true,
      sort: "price-desc",
      view: "list",
    });
    expect(parseFilters(new URLSearchParams(serializeFilters(state)))).toEqual(state);
  });

  it("falls back to defaults for unknown sort and view values", () => {
    const parsed = parseFilters(new URLSearchParams("sort=bogus&view=bogus"));
    expect(parsed.sort).toBe(DEFAULT_FILTERS.sort);
    expect(parsed.view).toBe("grid");
  });

  it("ignores malformed and negative numeric params", () => {
    const parsed = parseFilters(new URLSearchParams("min=abc&max=-5&rating=9"));
    expect(parsed.minPrice).toBeNull();
    expect(parsed.maxPrice).toBeNull();
    expect(parsed.minRating).toBeNull();
  });

  it("repairs a reversed hand-edited price range", () => {
    const parsed = parseFilters(new URLSearchParams("min=2000&max=500"));
    expect(parsed.minPrice).toBe(500);
    expect(parsed.maxPrice).toBe(2000);
  });

  it("drops empty category segments", () => {
    expect(parseFilters(new URLSearchParams("cat=,Safety,,")).categories).toEqual(["Safety"]);
  });

  it("only treats an exact '1' as a boolean flag", () => {
    expect(parseFilters(new URLSearchParams("stock=0&sale=true")).inStock).toBe(false);
    expect(parseFilters(new URLSearchParams("stock=0&sale=true")).onSale).toBe(false);
    expect(parseFilters(new URLSearchParams("stock=1")).inStock).toBe(true);
  });
});

describe("shop-filters — constants", () => {
  it("exposes a positive page size", () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
  });

  it("keeps every sort option parseable", () => {
    for (const option of SORT_OPTIONS) {
      const parsed = parseFilters(new URLSearchParams(`sort=${option.id}`));
      expect(parsed.sort).toBe(option.id);
    }
  });
});

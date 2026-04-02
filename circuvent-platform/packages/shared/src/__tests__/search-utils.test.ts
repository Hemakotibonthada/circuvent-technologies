// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Search Utilities Test Suite
// Tests for normalizeText, tokenize, fuzzySearch,
// buildSearchQuery, highlightMatches, calculateRelevance,
// buildFilterQuery, paginateResults.
// ──────────────────────────────────────────────────────────────

import {
  normalizeText,
  tokenize,
  fuzzySearch,
  buildSearchQuery,
  highlightMatches,
  calculateRelevance,
  buildFilterQuery,
  paginateResults,
} from "../utils/search-utils";

// ══════════════════════════════════════════════════════════════
// Text Normalization
// ══════════════════════════════════════════════════════════════

describe("normalizeText", () => {
  it("should lowercase text", () => {
    expect(normalizeText("Hello WORLD")).toBe("hello world");
  });

  it("should remove diacritics", () => {
    expect(normalizeText("café résumé")).toBe("cafe resume");
  });

  it("should trim and collapse whitespace", () => {
    expect(normalizeText("  hello   world  ")).toBe("hello world");
  });

  it("should handle empty input", () => {
    expect(normalizeText("")).toBe("");
    expect(normalizeText(null as any)).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════
// Tokenization
// ══════════════════════════════════════════════════════════════

describe("tokenize", () => {
  it("should split text into tokens", () => {
    const tokens = tokenize("Hello World JavaScript");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
    expect(tokens).toContain("javascript");
  });

  it("should remove stop words", () => {
    const tokens = tokenize("the quick and brown fox");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("and");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("brown");
    expect(tokens).toContain("fox");
  });

  it("should remove short tokens (< 2 chars)", () => {
    const tokens = tokenize("I am a developer");
    expect(tokens).not.toContain("i");
    expect(tokens).not.toContain("am");
    expect(tokens).toContain("developer");
  });

  it("should split on special characters", () => {
    const tokens = tokenize("hello@world.com user/admin");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
    expect(tokens).toContain("com");
  });

  it("should handle empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize(null as any)).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════
// Fuzzy Search
// ══════════════════════════════════════════════════════════════

describe("fuzzySearch", () => {
  const items = [
    { id: "1", name: "JavaScript Fundamentals", category: "Programming" },
    { id: "2", name: "TypeScript Best Practices", category: "Programming" },
    { id: "3", name: "Leave Policy 2026", category: "HR" },
    { id: "4", name: "Onboarding Guide", category: "HR" },
    { id: "5", name: "React Component Patterns", category: "Frontend" },
  ];

  it("should find exact match", () => {
    const results = fuzzySearch("JavaScript", items, ["name"]);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toContain("JavaScript");
    expect(results[0]._score).toBeGreaterThan(0);
  });

  it("should find partial match", () => {
    const results = fuzzySearch("script", items, ["name"]);
    expect(results.length).toBeGreaterThanOrEqual(2); // JavaScript and TypeScript
  });

  it("should search across multiple keys", () => {
    const results = fuzzySearch("HR", items, ["name", "category"]);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("should sort by relevance score descending", () => {
    const results = fuzzySearch("Policy", items, ["name"]);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]._score).toBeGreaterThanOrEqual(results[i]._score);
    }
  });

  it("should respect maxResults option", () => {
    const results = fuzzySearch("a", items, ["name"], { maxResults: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("should return empty for empty query", () => {
    expect(fuzzySearch("", items, ["name"])).toEqual([]);
  });

  it("should return empty for no matches", () => {
    const results = fuzzySearch("quantum", items, ["name"]);
    expect(results).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Prisma Search Query Builder
// ══════════════════════════════════════════════════════════════

describe("buildSearchQuery", () => {
  it("should build single field query", () => {
    const query = buildSearchQuery("hello", ["name"]);
    expect(query).toEqual({ name: { contains: "hello", mode: "insensitive" } });
  });

  it("should build multi-field OR query", () => {
    const query = buildSearchQuery("hello", ["name", "email"]);
    expect(query.OR).toBeDefined();
    expect(query.OR).toHaveLength(2);
  });

  it("should return empty for blank search", () => {
    expect(buildSearchQuery("", ["name"])).toEqual({});
    expect(buildSearchQuery("  ", ["name"])).toEqual({});
  });

  it("should return empty for no fields", () => {
    expect(buildSearchQuery("hello", [])).toEqual({});
  });

  it("should trim the search term", () => {
    const query = buildSearchQuery("  hello  ", ["name"]);
    expect(query.name.contains).toBe("hello");
  });
});

// ══════════════════════════════════════════════════════════════
// Highlight Matches
// ══════════════════════════════════════════════════════════════

describe("highlightMatches", () => {
  it("should wrap matches in mark tags", () => {
    const result = highlightMatches("Hello World", "world");
    expect(result).toBe("Hello <mark>World</mark>");
  });

  it("should handle case-insensitive matching", () => {
    const result = highlightMatches("JavaScript is great", "javascript");
    expect(result).toContain("<mark>");
  });

  it("should handle multiple matches", () => {
    const result = highlightMatches("test test test", "test");
    const matches = result.match(/<mark>/g);
    expect(matches).toHaveLength(3);
  });

  it("should handle empty inputs", () => {
    expect(highlightMatches("", "query")).toBe("");
    expect(highlightMatches("text", "")).toBe("text");
  });

  it("should escape regex special characters in query", () => {
    const result = highlightMatches("price is $10.00", "$10");
    expect(result).toContain("<mark>");
  });
});

// ══════════════════════════════════════════════════════════════
// Relevance Scoring
// ══════════════════════════════════════════════════════════════

describe("calculateRelevance", () => {
  it("should return 0 for empty inputs", () => {
    expect(calculateRelevance("", "document")).toBe(0);
    expect(calculateRelevance("query", "")).toBe(0);
  });

  it("should score matching documents higher", () => {
    const score1 = calculateRelevance("javascript", "JavaScript is a programming language for the web");
    const score2 = calculateRelevance("javascript", "Python is a great language");
    expect(score1).toBeGreaterThan(score2);
  });

  it("should score higher for more term occurrences", () => {
    const score1 = calculateRelevance("test", "test test test document");
    const score2 = calculateRelevance("test", "test document");
    expect(score1).toBeGreaterThan(score2);
  });

  it("should return 0 for no matches", () => {
    expect(calculateRelevance("quantum", "javascript programming tutorial")).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Filter Query Builder
// ══════════════════════════════════════════════════════════════

describe("buildFilterQuery", () => {
  it("should build boolean filter", () => {
    expect(buildFilterQuery({ active: true })).toEqual({ active: true });
  });

  it("should build array filter with 'in'", () => {
    expect(buildFilterQuery({ status: ["OPEN", "CLOSED"] })).toEqual({ status: { in: ["OPEN", "CLOSED"] } });
  });

  it("should build range filter", () => {
    const result = buildFilterQuery({ salary: { min: 50000, max: 100000 } });
    expect(result.salary).toEqual({ gte: 50000, lte: 100000 });
  });

  it("should skip null/undefined/empty values", () => {
    expect(buildFilterQuery({ a: null, b: undefined, c: "" })).toEqual({});
  });

  it("should handle string filters", () => {
    expect(buildFilterQuery({ name: "John" })).toEqual({ name: "John" });
  });

  it("should handle wildcard string filter", () => {
    const result = buildFilterQuery({ name: "*ohn*" });
    expect(result.name).toEqual({ contains: "ohn", mode: "insensitive" });
  });

  it("should skip empty arrays", () => {
    expect(buildFilterQuery({ tags: [] })).toEqual({});
  });
});

// ══════════════════════════════════════════════════════════════
// Pagination
// ══════════════════════════════════════════════════════════════

describe("paginateResults", () => {
  it("should calculate skip and take correctly", () => {
    const result = paginateResults(2, 20);
    expect(result.skip).toBe(20);
    expect(result.take).toBe(20);
    expect(result.meta.page).toBe(2);
    expect(result.meta.limit).toBe(20);
  });

  it("should default to page 1 with 20 items", () => {
    const result = paginateResults();
    expect(result.skip).toBe(0);
    expect(result.take).toBe(20);
  });

  it("should calculate total pages when total is provided", () => {
    const result = paginateResults(1, 10, 95);
    expect(result.meta.totalPages).toBe(10);
    expect(result.meta.total).toBe(95);
  });

  it("should handle page 1 correctly", () => {
    const result = paginateResults(1, 10);
    expect(result.skip).toBe(0);
    expect(result.take).toBe(10);
  });
});

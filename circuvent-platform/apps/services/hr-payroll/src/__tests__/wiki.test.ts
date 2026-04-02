// ──────────────────────────────────────────────────────────────
// WikiService — Test Suite
// Tests for page lifecycle, revisions, search, bookmarks,
// comments, dashboard, TOC generation, read time.
// ──────────────────────────────────────────────────────────────

const mockPrisma = {
  generatedDocument: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import { WikiService } from "../services/wiki.service";

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

let service: WikiService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new WikiService();
});

// ══════════════════════════════════════════════════════════════
// Page Creation
// ══════════════════════════════════════════════════════════════

describe("Page Creation", () => {
  it("should create a new wiki page with valid input", async () => {
    const page = await service.createPage({
      title: "Getting Started Guide",
      content: "# Welcome\n\nThis is the getting started guide for new employees.",
      category: "ONBOARDING",
      tags: ["onboarding", "guide"],
      authorId: "user-001",
      authorName: "John Doe",
    });

    expect(page).toBeDefined();
    expect(page.id).toMatch(/^WIKI-\d{5}$/);
    expect(page.title).toBe("Getting Started Guide");
    expect(page.category).toBe("ONBOARDING");
    expect(page.tags).toEqual(["onboarding", "guide"]);
    expect(page.authorId).toBe("user-001");
    expect(page.status).toBe("PUBLISHED");
    expect(page.viewCount).toBe(0);
    expect(page.revisionCount).toBe(1);
  });

  it("should create a draft page", async () => {
    const page = await service.createPage({
      title: "Draft Article",
      content: "Work in progress",
      category: "GENERAL",
      tags: [],
      authorId: "user-001",
      status: "DRAFT",
    });

    expect(page.status).toBe("DRAFT");
  });

  it("should trim title and lowercase tags", async () => {
    const page = await service.createPage({
      title: "  Spaces Around Title  ",
      content: "Content",
      category: "HR",
      tags: ["Policy", " RULES "],
      authorId: "user-001",
    });

    expect(page.title).toBe("Spaces Around Title");
    expect(page.tags).toEqual(["policy", "rules"]);
  });

  it("should calculate read time correctly", async () => {
    const words200 = Array(200).fill("word").join(" ");
    const page = await service.createPage({
      title: "Long Article",
      content: words200,
      category: "GENERAL",
      tags: [],
      authorId: "user-001",
    });

    expect(page.readTimeMinutes).toBe(1);
  });

  it("should generate table of contents from markdown headings", async () => {
    const content = "# Introduction\n\nSome text.\n\n## Section One\n\nMore text.\n\n### Subsection\n\nDetails.\n\n## Section Two\n\nFinal text.";
    const page = await service.createPage({
      title: "TOC Test",
      content,
      category: "TUTORIAL",
      tags: [],
      authorId: "user-001",
    });

    expect(page.tableOfContents).toHaveLength(4);
    expect(page.tableOfContents[0]).toEqual({ level: 1, text: "Introduction", slug: "introduction" });
    expect(page.tableOfContents[1]).toEqual({ level: 2, text: "Section One", slug: "section-one" });
    expect(page.tableOfContents[2]).toEqual({ level: 3, text: "Subsection", slug: "subsection" });
  });

  it("should create an initial revision", async () => {
    const page = await service.createPage({
      title: "Revision Test",
      content: "Initial content",
      category: "GENERAL",
      tags: [],
      authorId: "user-001",
    });

    const revisions = service.getRevisions(page.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].revisionNumber).toBe(1);
    expect(revisions[0].changeDescription).toBe("Initial creation");
  });
});

// ══════════════════════════════════════════════════════════════
// Page Updates
// ══════════════════════════════════════════════════════════════

describe("Page Updates", () => {
  let pageId: string;

  beforeEach(async () => {
    const page = await service.createPage({
      title: "Update Test",
      content: "Original content",
      category: "GENERAL",
      tags: [],
      authorId: "user-001",
      authorName: "Author",
    });
    pageId = page.id;
  });

  it("should update page content and create a new revision", async () => {
    const updated = await service.updatePage(pageId, "Updated content v2", "user-002", "Editor", "Fixed typos");

    expect(updated).toBeDefined();
    expect(updated!.content).toBe("Updated content v2");
    expect(updated!.revisionCount).toBe(2);

    const revisions = service.getRevisions(pageId);
    expect(revisions).toHaveLength(2);
    expect(revisions[0].revisionNumber).toBe(2);
    expect(revisions[0].changeDescription).toBe("Fixed typos");
  });

  it("should return null for non-existent page", async () => {
    const result = await service.updatePage("WIKI-99999", "Content", "user-001");
    expect(result).toBeNull();
  });

  it("should not update archived pages", async () => {
    service.archivePage(pageId);
    const result = await service.updatePage(pageId, "New content", "user-001");
    expect(result).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Page Retrieval
// ══════════════════════════════════════════════════════════════

describe("Page Retrieval", () => {
  let pageId: string;

  beforeEach(async () => {
    const page = await service.createPage({
      title: "Retrieval Test",
      content: "Test content",
      category: "HR",
      tags: ["test"],
      authorId: "user-001",
    });
    pageId = page.id;
  });

  it("should get a page by ID", () => {
    const page = service.getPage(pageId);
    expect(page).toBeDefined();
    expect(page!.title).toBe("Retrieval Test");
  });

  it("should increment view count on retrieval", () => {
    service.getPage(pageId, true);
    service.getPage(pageId, true);
    const page = service.getPage(pageId, true);
    expect(page!.viewCount).toBe(3);
  });

  it("should not increment view count when flag is false", () => {
    service.getPage(pageId, false);
    service.getPage(pageId, false);
    const page = service.getPage(pageId, false);
    expect(page!.viewCount).toBe(0);
  });

  it("should return null for non-existent page", () => {
    expect(service.getPage("WIKI-99999")).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Search
// ══════════════════════════════════════════════════════════════

describe("Search", () => {
  beforeEach(async () => {
    await service.createPage({ title: "JavaScript Fundamentals", content: "Learn about variables, functions, and closures in JavaScript.", category: "ENGINEERING", tags: ["javascript", "tutorial"], authorId: "u1" });
    await service.createPage({ title: "TypeScript Best Practices", content: "Type safety and advanced TypeScript patterns.", category: "ENGINEERING", tags: ["typescript", "best-practices"], authorId: "u1" });
    await service.createPage({ title: "Leave Policy 2026", content: "Updated leave policy for all employees.", category: "HR", tags: ["policy", "leave"], authorId: "u2" });
    await service.createPage({ title: "Onboarding Checklist", content: "Complete these steps on your first day.", category: "ONBOARDING", tags: ["onboarding"], authorId: "u2" });
  });

  it("should find pages by title match", () => {
    const results = service.searchPages("JavaScript");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].title).toContain("JavaScript");
  });

  it("should find pages by content match", () => {
    const results = service.searchPages("closures");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should find pages by tag match", () => {
    const results = service.searchPages("typescript");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should return empty results for no match", () => {
    const results = service.searchPages("quantum physics");
    expect(results).toHaveLength(0);
  });

  it("should return empty for empty query", () => {
    expect(service.searchPages("")).toHaveLength(0);
    expect(service.searchPages("  ")).toHaveLength(0);
  });

  it("should sort by relevance score", () => {
    const results = service.searchPages("policy leave");
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].relevanceScore).toBeGreaterThanOrEqual(results[i].relevanceScore);
    }
  });

  it("should respect limit parameter", () => {
    const results = service.searchPages("a", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("should not include archived pages", async () => {
    const page = await service.createPage({ title: "Archived Page", content: "This will be archived", category: "GENERAL", tags: [], authorId: "u1" });
    service.archivePage(page.id);
    const results = service.searchPages("Archived Page");
    expect(results).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Bookmarks
// ══════════════════════════════════════════════════════════════

describe("Bookmarks", () => {
  let pageId: string;

  beforeEach(async () => {
    const page = await service.createPage({ title: "Bookmark Test", content: "Content", category: "GENERAL", tags: [], authorId: "u1" });
    pageId = page.id;
  });

  it("should bookmark a page", () => {
    expect(service.bookmarkPage(pageId, "user-001")).toBe(true);
    expect(service.isBookmarked(pageId, "user-001")).toBe(true);
  });

  it("should remove a bookmark", () => {
    service.bookmarkPage(pageId, "user-001");
    expect(service.removeBookmark(pageId, "user-001")).toBe(true);
    expect(service.isBookmarked(pageId, "user-001")).toBe(false);
  });

  it("should get user bookmarks", async () => {
    const page2 = await service.createPage({ title: "Another Page", content: "C", category: "HR", tags: [], authorId: "u1" });
    service.bookmarkPage(pageId, "user-001");
    service.bookmarkPage(page2.id, "user-001");

    const bookmarks = service.getUserBookmarks("user-001");
    expect(bookmarks).toHaveLength(2);
  });

  it("should return false for non-existent page", () => {
    expect(service.bookmarkPage("WIKI-99999", "user-001")).toBe(false);
  });

  it("should return false when removing non-existent bookmark", () => {
    expect(service.removeBookmark(pageId, "user-999")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Comments
// ══════════════════════════════════════════════════════════════

describe("Comments", () => {
  let pageId: string;

  beforeEach(async () => {
    const page = await service.createPage({ title: "Comment Test", content: "Content", category: "GENERAL", tags: [], authorId: "u1" });
    pageId = page.id;
  });

  it("should add a comment to a page", () => {
    const comment = service.addComment(pageId, "user-001", "John", "Great article!");
    expect(comment).toBeDefined();
    expect(comment!.content).toBe("Great article!");
    expect(comment!.userName).toBe("John");
  });

  it("should list comments in reverse chronological order", () => {
    service.addComment(pageId, "u1", "A", "First");
    service.addComment(pageId, "u2", "B", "Second");
    service.addComment(pageId, "u3", "C", "Third");

    const comments = service.getComments(pageId);
    expect(comments).toHaveLength(3);
    expect(comments[0].content).toBe("Third");
  });

  it("should return null for comment on non-existent page", () => {
    expect(service.addComment("WIKI-99999", "u1", "A", "Comment")).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Revisions & Restore
// ══════════════════════════════════════════════════════════════

describe("Revisions & Restore", () => {
  let pageId: string;

  beforeEach(async () => {
    const page = await service.createPage({ title: "Revision Test", content: "Version 1", category: "GENERAL", tags: [], authorId: "u1" });
    pageId = page.id;
    await service.updatePage(pageId, "Version 2", "u2", "Editor 2");
    await service.updatePage(pageId, "Version 3", "u3", "Editor 3");
  });

  it("should have 3 revisions", () => {
    const revisions = service.getRevisions(pageId);
    expect(revisions).toHaveLength(3);
  });

  it("should return revisions in descending order", () => {
    const revisions = service.getRevisions(pageId);
    expect(revisions[0].revisionNumber).toBe(3);
    expect(revisions[2].revisionNumber).toBe(1);
  });

  it("should restore to a previous revision", async () => {
    const revisions = service.getRevisions(pageId);
    const rev1 = revisions.find((r) => r.revisionNumber === 1)!;

    const restored = await service.restoreRevision(pageId, rev1.id, "u1", "Admin");
    expect(restored).toBeDefined();
    expect(restored!.content).toBe("Version 1");
    expect(restored!.revisionCount).toBe(4); // New revision created
  });

  it("should return null for invalid revision", async () => {
    const result = await service.restoreRevision(pageId, "REV-999999", "u1");
    expect(result).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Dashboard
// ══════════════════════════════════════════════════════════════

describe("Dashboard", () => {
  beforeEach(async () => {
    await service.createPage({ title: "P1", content: "C1", category: "HR", tags: [], authorId: "u1", authorName: "Alice" });
    await service.createPage({ title: "P2", content: "C2", category: "HR", tags: [], authorId: "u1", authorName: "Alice" });
    await service.createPage({ title: "P3", content: "C3", category: "ENGINEERING", tags: [], authorId: "u2", authorName: "Bob" });
  });

  it("should return correct dashboard stats", () => {
    const dashboard = service.getDashboard();
    expect(dashboard.totalPages).toBe(3);
    expect(dashboard.publishedPages).toBe(3);
    expect(dashboard.draftPages).toBe(0);
    expect(dashboard.archivedPages).toBe(0);
  });

  it("should count by category", () => {
    const dashboard = service.getDashboard();
    const hrCategory = dashboard.byCategory.find((c) => c.category === "HR");
    expect(hrCategory?.count).toBe(2);
  });

  it("should list top contributors", () => {
    const dashboard = service.getDashboard();
    expect(dashboard.topContributors.length).toBeGreaterThanOrEqual(1);
    expect(dashboard.topContributors[0].authorName).toBe("Alice");
    expect(dashboard.topContributors[0].pageCount).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════
// Popular & Recent Pages
// ══════════════════════════════════════════════════════════════

describe("Popular & Recent Pages", () => {
  beforeEach(async () => {
    const p1 = await service.createPage({ title: "Popular", content: "C", category: "GEN", tags: [], authorId: "u1" });
    await service.createPage({ title: "Unpopular", content: "C", category: "GEN", tags: [], authorId: "u1" });

    // Simulate views
    for (let i = 0; i < 10; i++) {
      service.getPage(p1.id, true);
    }
  });

  it("should return pages sorted by view count", () => {
    const popular = service.getPopularPages(5);
    expect(popular[0].title).toBe("Popular");
    expect(popular[0].viewCount).toBe(10);
  });

  it("should return recently updated pages", () => {
    const recent = service.getRecentPages(5);
    expect(recent.length).toBeGreaterThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════════════
// Utility Functions
// ══════════════════════════════════════════════════════════════

describe("Utility Functions", () => {
  it("should calculate read time as words/200, minimum 1", () => {
    expect(service.calculateReadTime("")).toBe(0);
    expect(service.calculateReadTime("hello")).toBe(1);
    expect(service.calculateReadTime(Array(400).fill("word").join(" "))).toBe(2);
    expect(service.calculateReadTime(Array(1000).fill("word").join(" "))).toBe(5);
  });

  it("should generate TOC from headings", () => {
    const toc = service.generateTableOfContents("# Title\n## Subtitle\n### Sub-subtitle");
    expect(toc).toHaveLength(3);
    expect(toc[0]).toEqual({ level: 1, text: "Title", slug: "title" });
    expect(toc[1]).toEqual({ level: 2, text: "Subtitle", slug: "subtitle" });
  });

  it("should handle empty content for TOC", () => {
    expect(service.generateTableOfContents("")).toEqual([]);
  });

  it("should slugify headings with special characters", () => {
    const toc = service.generateTableOfContents("# Hello World! (2026)");
    expect(toc[0].slug).toBe("hello-world-2026");
  });
});

// ══════════════════════════════════════════════════════════════
// Archive
// ══════════════════════════════════════════════════════════════

describe("Archive", () => {
  it("should archive a page", async () => {
    const page = await service.createPage({ title: "To Archive", content: "C", category: "GEN", tags: [], authorId: "u1" });
    expect(service.archivePage(page.id)).toBe(true);

    const retrieved = service.getPage(page.id);
    expect(retrieved!.status).toBe("ARCHIVED");
  });

  it("should return false for non-existent page", () => {
    expect(service.archivePage("WIKI-99999")).toBe(false);
  });

  it("should exclude archived pages from getAllPages", async () => {
    const page = await service.createPage({ title: "Archived", content: "C", category: "GEN", tags: [], authorId: "u1" });
    service.archivePage(page.id);

    const result = service.getAllPages();
    const found = result.pages.find((p) => p.id === page.id);
    expect(found).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════
// Categories
// ══════════════════════════════════════════════════════════════

describe("Categories", () => {
  beforeEach(async () => {
    await service.createPage({ title: "A", content: "C", category: "HR", tags: [], authorId: "u1" });
    await service.createPage({ title: "B", content: "C", category: "HR", tags: [], authorId: "u1" });
    await service.createPage({ title: "C", content: "C", category: "ENGINEERING", tags: [], authorId: "u1" });
  });

  it("should list categories with counts", () => {
    const cats = service.getCategories();
    expect(cats.length).toBeGreaterThanOrEqual(2);
    const hr = cats.find((c) => c.name === "HR");
    expect(hr?.count).toBe(2);
  });

  it("should sort categories alphabetically", () => {
    const cats = service.getCategories();
    for (let i = 1; i < cats.length; i++) {
      expect(cats[i - 1].name.localeCompare(cats[i].name)).toBeLessThanOrEqual(0);
    }
  });
});

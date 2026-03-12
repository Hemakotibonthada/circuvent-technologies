// ──────────────────────────────────────────────────────────────
// HR Payroll — Wiki / Knowledge Base Service
// Page lifecycle, revision management, search, bookmarks,
// comments, view tracking, table-of-contents generation.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface WikiPage {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  authorId: string;
  authorName: string;
  status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
  viewCount: number;
  readTimeMinutes: number;
  tableOfContents: TOCEntry[];
  createdAt: string;
  updatedAt: string;
  revisionCount: number;
}

interface WikiRevision {
  id: string;
  pageId: string;
  content: string;
  editorId: string;
  editorName: string;
  revisionNumber: number;
  changeDescription: string;
  createdAt: string;
}

interface WikiComment {
  id: string;
  pageId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

interface WikiBookmark {
  pageId: string;
  userId: string;
  title: string;
  category: string;
  bookmarkedAt: string;
}

interface WikiDashboard {
  totalPages: number;
  publishedPages: number;
  draftPages: number;
  archivedPages: number;
  totalRevisions: number;
  totalComments: number;
  recentUpdates: number;
  byCategory: Array<{ category: string; count: number }>;
  topContributors: Array<{ authorId: string; authorName: string; pageCount: number }>;
  popularPages: Array<{ id: string; title: string; viewCount: number }>;
}

interface TOCEntry {
  level: number;
  text: string;
  slug: string;
}

interface CreatePageInput {
  title: string;
  content: string;
  category: string;
  tags: string[];
  authorId: string;
  authorName?: string;
  status?: "PUBLISHED" | "DRAFT";
}

interface SearchResult {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  relevanceScore: number;
  updatedAt: string;
}

// ══════════════════════════════════════════════════════════════
// In-Memory Storage (mirrors pattern from ICM)
// ══════════════════════════════════════════════════════════════

const wikiPages = new Map<string, WikiPage>();
const wikiRevisions = new Map<string, WikiRevision[]>();
const wikiComments = new Map<string, WikiComment[]>();
const wikiBookmarks = new Map<string, Set<string>>(); // userId → Set<pageId>
let pageSequence = 0;
let revisionSequence = 0;
let commentSequence = 0;

// ══════════════════════════════════════════════════════════════
// WikiService Class
// ══════════════════════════════════════════════════════════════

export class WikiService {
  // ── Create Page ───────────────────────────────────────────

  async createPage(input: CreatePageInput): Promise<WikiPage> {
    pageSequence++;
    const id = `WIKI-${String(pageSequence).padStart(5, "0")}`;
    const now = new Date().toISOString();
    const readTime = this.calculateReadTime(input.content);
    const toc = this.generateTableOfContents(input.content);

    const page: WikiPage = {
      id,
      title: input.title.trim(),
      content: input.content,
      category: input.category,
      tags: input.tags.map((t) => t.trim().toLowerCase()),
      authorId: input.authorId,
      authorName: input.authorName || "Unknown",
      status: input.status || "PUBLISHED",
      viewCount: 0,
      readTimeMinutes: readTime,
      tableOfContents: toc,
      createdAt: now,
      updatedAt: now,
      revisionCount: 1,
    };

    wikiPages.set(id, page);

    // Store initial revision
    revisionSequence++;
    const revision: WikiRevision = {
      id: `REV-${String(revisionSequence).padStart(6, "0")}`,
      pageId: id,
      content: input.content,
      editorId: input.authorId,
      editorName: input.authorName || "Unknown",
      revisionNumber: 1,
      changeDescription: "Initial creation",
      createdAt: now,
    };
    wikiRevisions.set(id, [revision]);

    // Also store in GeneratedDocument for DB persistence
    try {
      await prisma.generatedDocument.create({
        data: {
          generatedBy: input.authorId,
          entityType: "WIKI_PAGE",
          name: input.title,
          category: input.category,
          content: JSON.stringify({
            body: input.content,
            category: input.category,
            tags: input.tags,
            status: page.status,
            viewCount: 0,
            readTimeMinutes: readTime,
          }),
        },
      });
    } catch {
      // DB persistence is best-effort; in-memory is primary
    }

    return page;
  }

  // ── Update Page (creates new revision) ────────────────────

  async updatePage(
    pageId: string,
    content: string,
    editorId: string,
    editorName?: string,
    changeDescription?: string,
  ): Promise<WikiPage | null> {
    const page = wikiPages.get(pageId);
    if (!page || page.status === "ARCHIVED") return null;

    const now = new Date().toISOString();
    const readTime = this.calculateReadTime(content);
    const toc = this.generateTableOfContents(content);

    page.content = content;
    page.readTimeMinutes = readTime;
    page.tableOfContents = toc;
    page.updatedAt = now;
    page.revisionCount++;

    // Create revision
    revisionSequence++;
    const revision: WikiRevision = {
      id: `REV-${String(revisionSequence).padStart(6, "0")}`,
      pageId,
      content,
      editorId,
      editorName: editorName || "Unknown",
      revisionNumber: page.revisionCount,
      changeDescription: changeDescription || `Revision ${page.revisionCount}`,
      createdAt: now,
    };

    const revisions = wikiRevisions.get(pageId) || [];
    revisions.push(revision);
    wikiRevisions.set(pageId, revisions);

    // Persist revision to DB
    try {
      await prisma.generatedDocument.create({
        data: {
          generatedBy: editorId,
          entityType: "WIKI_REVISION",
          name: `${page.title} — Rev ${page.revisionCount}`,
          category: page.category,
          content: JSON.stringify({
            pageId,
            body: content,
            revisionNumber: page.revisionCount,
            changeDescription: revision.changeDescription,
          }),
        },
      });
    } catch {
      // Best-effort DB persistence
    }

    return page;
  }

  // ── Get Page (with view count increment) ──────────────────

  getPage(pageId: string, incrementView: boolean = true): WikiPage | null {
    const page = wikiPages.get(pageId);
    if (!page) return null;

    if (incrementView && page.status === "PUBLISHED") {
      page.viewCount++;
    }

    return { ...page };
  }

  // ── Search Pages ──────────────────────────────────────────

  searchPages(query: string, limit: number = 20): SearchResult[] {
    if (!query || !query.trim()) return [];

    const normalizedQuery = query.toLowerCase().trim();
    const queryTokens = normalizedQuery.split(/\s+/).filter((t) => t.length >= 2);
    const results: SearchResult[] = [];

    for (const page of wikiPages.values()) {
      if (page.status === "ARCHIVED") continue;

      let score = 0;
      const titleLower = page.title.toLowerCase();
      const contentLower = page.content.toLowerCase();

      // Title match (highest weight)
      if (titleLower.includes(normalizedQuery)) {
        score += 10;
      }
      for (const token of queryTokens) {
        if (titleLower.includes(token)) score += 3;
      }

      // Content match
      if (contentLower.includes(normalizedQuery)) {
        score += 5;
      }
      for (const token of queryTokens) {
        if (contentLower.includes(token)) score += 1;
      }

      // Tag match
      for (const tag of page.tags) {
        if (tag.includes(normalizedQuery)) score += 4;
        for (const token of queryTokens) {
          if (tag.includes(token)) score += 2;
        }
      }

      // Category match
      if (page.category.toLowerCase().includes(normalizedQuery)) {
        score += 3;
      }

      if (score > 0) {
        results.push({
          id: page.id,
          title: page.title,
          excerpt: this.generateExcerpt(page.content, query),
          category: page.category,
          tags: page.tags,
          relevanceScore: score,
          updatedAt: page.updatedAt,
        });
      }
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return results.slice(0, limit);
  }

  // ── Get Pages by Category ─────────────────────────────────

  getPagesByCategory(category: string): WikiPage[] {
    const results: WikiPage[] = [];
    for (const page of wikiPages.values()) {
      if (page.category === category && page.status !== "ARCHIVED") {
        results.push({ ...page });
      }
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  // ── Get All Pages (with optional filters) ─────────────────

  getAllPages(options: {
    search?: string;
    category?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): { pages: WikiPage[]; total: number } {
    const { search, category, status, page = 1, limit = 20 } = options;
    let pages = Array.from(wikiPages.values());

    if (status) {
      pages = pages.filter((p) => p.status === status);
    } else {
      pages = pages.filter((p) => p.status !== "ARCHIVED");
    }

    if (category) {
      pages = pages.filter((p) => p.category === category);
    }

    if (search) {
      const term = search.toLowerCase();
      pages = pages.filter(
        (p) =>
          p.title.toLowerCase().includes(term) ||
          p.content.toLowerCase().includes(term) ||
          p.tags.some((t) => t.includes(term)),
      );
    }

    pages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = pages.length;
    const skip = (page - 1) * limit;

    return { pages: pages.slice(skip, skip + limit), total };
  }

  // ── Get Revisions ─────────────────────────────────────────

  getRevisions(pageId: string): WikiRevision[] {
    return (wikiRevisions.get(pageId) || [])
      .slice()
      .sort((a, b) => b.revisionNumber - a.revisionNumber);
  }

  // ── Restore Revision ──────────────────────────────────────

  async restoreRevision(pageId: string, revisionId: string, userId: string, userName?: string): Promise<WikiPage | null> {
    const revisions = wikiRevisions.get(pageId);
    if (!revisions) return null;

    const revision = revisions.find((r) => r.id === revisionId);
    if (!revision) return null;

    return this.updatePage(
      pageId,
      revision.content,
      userId,
      userName,
      `Restored to revision ${revision.revisionNumber}`,
    );
  }

  // ── Archive Page ──────────────────────────────────────────

  archivePage(pageId: string): boolean {
    const page = wikiPages.get(pageId);
    if (!page) return false;

    page.status = "ARCHIVED";
    page.updatedAt = new Date().toISOString();
    return true;
  }

  // ── Comments ──────────────────────────────────────────────

  addComment(pageId: string, userId: string, userName: string, content: string): WikiComment | null {
    if (!wikiPages.has(pageId)) return null;

    commentSequence++;
    const comment: WikiComment = {
      id: `CMT-${String(commentSequence).padStart(6, "0")}`,
      pageId,
      userId,
      userName,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    const comments = wikiComments.get(pageId) || [];
    comments.push(comment);
    wikiComments.set(pageId, comments);

    return comment;
  }

  getComments(pageId: string): WikiComment[] {
    return (wikiComments.get(pageId) || [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ── Bookmarks ─────────────────────────────────────────────

  bookmarkPage(pageId: string, userId: string): boolean {
    if (!wikiPages.has(pageId)) return false;

    const bookmarks = wikiBookmarks.get(userId) || new Set();
    bookmarks.add(pageId);
    wikiBookmarks.set(userId, bookmarks);
    return true;
  }

  removeBookmark(pageId: string, userId: string): boolean {
    const bookmarks = wikiBookmarks.get(userId);
    if (!bookmarks) return false;

    return bookmarks.delete(pageId);
  }

  getUserBookmarks(userId: string): WikiBookmark[] {
    const bookmarks = wikiBookmarks.get(userId);
    if (!bookmarks || bookmarks.size === 0) return [];

    const results: WikiBookmark[] = [];
    for (const pageId of bookmarks) {
      const page = wikiPages.get(pageId);
      if (page) {
        results.push({
          pageId: page.id,
          userId,
          title: page.title,
          category: page.category,
          bookmarkedAt: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  isBookmarked(pageId: string, userId: string): boolean {
    const bookmarks = wikiBookmarks.get(userId);
    return bookmarks?.has(pageId) || false;
  }

  // ── Popular Pages ─────────────────────────────────────────

  getPopularPages(limit: number = 10): WikiPage[] {
    return Array.from(wikiPages.values())
      .filter((p) => p.status === "PUBLISHED")
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, limit)
      .map((p) => ({ ...p }));
  }

  // ── Recent Pages ──────────────────────────────────────────

  getRecentPages(limit: number = 10): WikiPage[] {
    return Array.from(wikiPages.values())
      .filter((p) => p.status !== "ARCHIVED")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((p) => ({ ...p }));
  }

  // ── Dashboard Stats ───────────────────────────────────────

  getDashboard(): WikiDashboard {
    const pages = Array.from(wikiPages.values());
    const published = pages.filter((p) => p.status === "PUBLISHED");
    const drafts = pages.filter((p) => p.status === "DRAFT");
    const archived = pages.filter((p) => p.status === "ARCHIVED");

    // Count total revisions
    let totalRevisions = 0;
    for (const revs of wikiRevisions.values()) {
      totalRevisions += revs.length;
    }

    // Count total comments
    let totalComments = 0;
    for (const cmts of wikiComments.values()) {
      totalComments += cmts.length;
    }

    // Recent updates (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentUpdates = pages.filter((p) => p.updatedAt >= sevenDaysAgo).length;

    // By category
    const categoryMap = new Map<string, number>();
    for (const page of published) {
      categoryMap.set(page.category, (categoryMap.get(page.category) || 0) + 1);
    }
    const byCategory = Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // Top contributors
    const contributorMap = new Map<string, { authorId: string; authorName: string; count: number }>();
    for (const page of pages) {
      const existing = contributorMap.get(page.authorId);
      if (existing) {
        existing.count++;
      } else {
        contributorMap.set(page.authorId, { authorId: page.authorId, authorName: page.authorName, count: 1 });
      }
    }
    const topContributors = Array.from(contributorMap.values())
      .map((c) => ({ authorId: c.authorId, authorName: c.authorName, pageCount: c.count }))
      .sort((a, b) => b.pageCount - a.pageCount)
      .slice(0, 10);

    // Popular pages
    const popularPages = published
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 5)
      .map((p) => ({ id: p.id, title: p.title, viewCount: p.viewCount }));

    return {
      totalPages: pages.length,
      publishedPages: published.length,
      draftPages: drafts.length,
      archivedPages: archived.length,
      totalRevisions,
      totalComments,
      recentUpdates,
      byCategory,
      topContributors,
      popularPages,
    };
  }

  // ── Get Categories ────────────────────────────────────────

  getCategories(): Array<{ name: string; count: number }> {
    const categoryMap = new Map<string, number>();
    for (const page of wikiPages.values()) {
      if (page.status !== "ARCHIVED") {
        categoryMap.set(page.category, (categoryMap.get(page.category) || 0) + 1);
      }
    }

    return Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Generate Table of Contents ────────────────────────────

  generateTableOfContents(content: string): TOCEntry[] {
    if (!content) return [];

    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const entries: TOCEntry[] = [];
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      entries.push({ level, text, slug });
    }

    return entries;
  }

  // ── Calculate Read Time ───────────────────────────────────

  calculateReadTime(content: string): number {
    if (!content) return 0;
    const words = content.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  }

  // ── Generate Excerpt ──────────────────────────────────────

  private generateExcerpt(content: string, query: string, maxLen: number = 200): string {
    if (!content) return "";

    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerContent.indexOf(lowerQuery);

    if (idx >= 0) {
      const start = Math.max(0, idx - 50);
      const end = Math.min(content.length, idx + lowerQuery.length + 150);
      let excerpt = content.substring(start, end).trim();
      if (start > 0) excerpt = "..." + excerpt;
      if (end < content.length) excerpt = excerpt + "...";
      return excerpt;
    }

    return content.substring(0, maxLen).trim() + (content.length > maxLen ? "..." : "");
  }
}

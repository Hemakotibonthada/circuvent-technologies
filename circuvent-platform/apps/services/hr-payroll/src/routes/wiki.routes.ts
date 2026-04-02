// ──────────────────────────────────────────────────────────────
// HR Payroll — Wiki / Knowledge Base Routes
// Full page lifecycle: CRUD, revisions, search, comments,
// bookmarks, categories, popular/recent, dashboard stats.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { WikiService } from "../services/wiki.service";

const router = Router();
const wikiService = new WikiService();

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function successResponse<T>(data: T, message?: string, meta?: any) {
  return { success: true, data, message, meta };
}

function errorResponse(error: string) {
  return { success: false, error };
}

// ══════════════════════════════════════════════════════════════
// GET /wiki/dashboard — Wiki statistics
// ══════════════════════════════════════════════════════════════

router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const dashboard = wikiService.getDashboard();
    res.json(successResponse(dashboard));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch wiki dashboard"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /wiki/search — Full-text search across pages
// ══════════════════════════════════════════════════════════════

router.get("/search", async (req: Request, res: Response) => {
  try {
    const { q, limit = "20" } = req.query;
    if (!q) {
      return res.status(400).json(errorResponse("Query parameter 'q' is required"));
    }

    const results = wikiService.searchPages(String(q), parseInt(String(limit), 10));
    res.json(successResponse(results, undefined, { total: results.length }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Search failed"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /wiki/recent — Recently updated pages
// ══════════════════════════════════════════════════════════════

router.get("/recent", async (req: Request, res: Response) => {
  try {
    const { limit = "10" } = req.query;
    const pages = wikiService.getRecentPages(parseInt(String(limit), 10));
    res.json(successResponse(pages));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch recent pages"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /wiki/popular — Most viewed pages
// ══════════════════════════════════════════════════════════════

router.get("/popular", async (req: Request, res: Response) => {
  try {
    const { limit = "10" } = req.query;
    const pages = wikiService.getPopularPages(parseInt(String(limit), 10));
    res.json(successResponse(pages));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch popular pages"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /wiki/categories — List all categories
// ══════════════════════════════════════════════════════════════

router.get("/categories", async (_req: Request, res: Response) => {
  try {
    const categories = wikiService.getCategories();
    res.json(successResponse(categories));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch categories"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /wiki/my-bookmarks — Current user's bookmarks
// ══════════════════════════════════════════════════════════════

router.get("/my-bookmarks", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || String(req.query.userId || "");
    if (!userId) {
      return res.status(400).json(errorResponse("User ID is required"));
    }

    const bookmarks = wikiService.getUserBookmarks(userId);
    res.json(successResponse(bookmarks));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch bookmarks"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /wiki/pages — List all pages (with search, category filter)
// ══════════════════════════════════════════════════════════════

router.get("/pages", async (req: Request, res: Response) => {
  try {
    const {
      search, category, status,
      page = "1", limit = "20",
    } = req.query;

    const result = wikiService.getAllPages({
      search: search ? String(search) : undefined,
      category: category ? String(category) : undefined,
      status: status ? String(status) : undefined,
      page: parseInt(String(page), 10),
      limit: parseInt(String(limit), 10),
    });

    res.json(successResponse(result.pages, undefined, {
      total: result.total,
      page: parseInt(String(page), 10),
      limit: parseInt(String(limit), 10),
      totalPages: Math.ceil(result.total / parseInt(String(limit), 10)),
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch wiki pages"));
  }
});

// ══════════════════════════════════════════════════════════════
// POST /wiki/pages — Create new page
// ══════════════════════════════════════════════════════════════

router.post("/pages", async (req: Request, res: Response) => {
  try {
    const { title, content, category, tags, status } = req.body;
    const userId = (req as any).user?.id || req.body.userId;

    if (!title || !content || !category) {
      return res.status(400).json(errorResponse("Title, content, and category are required"));
    }

    const page = await wikiService.createPage({
      title,
      content,
      category,
      tags: tags || [],
      authorId: userId || "system",
      authorName: req.body.authorName || (req as any).user?.firstName || "System",
      status: status || "PUBLISHED",
    });

    res.status(201).json(successResponse(page, "Page created successfully"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to create page"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /wiki/pages/:id — Page detail with revisions
// ══════════════════════════════════════════════════════════════

router.get("/pages/:id", async (req: Request, res: Response) => {
  try {
    const page = wikiService.getPage(req.params.id);
    if (!page) {
      return res.status(404).json(errorResponse("Page not found"));
    }

    const revisions = wikiService.getRevisions(req.params.id);
    const comments = wikiService.getComments(req.params.id);
    const userId = (req as any).user?.id || String(req.query.userId || "");
    const isBookmarked = userId ? wikiService.isBookmarked(req.params.id, userId) : false;

    res.json(successResponse({
      ...page,
      revisions,
      comments,
      isBookmarked,
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch page"));
  }
});

// ══════════════════════════════════════════════════════════════
// PUT /wiki/pages/:id — Update page (creates new revision)
// ══════════════════════════════════════════════════════════════

router.put("/pages/:id", async (req: Request, res: Response) => {
  try {
    const { content, changeDescription } = req.body;
    const userId = (req as any).user?.id || req.body.userId;

    if (!content) {
      return res.status(400).json(errorResponse("Content is required"));
    }

    const page = await wikiService.updatePage(
      req.params.id,
      content,
      userId || "system",
      req.body.editorName || (req as any).user?.firstName,
      changeDescription,
    );

    if (!page) {
      return res.status(404).json(errorResponse("Page not found or archived"));
    }

    res.json(successResponse(page, "Page updated successfully"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to update page"));
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE /wiki/pages/:id — Archive page
// ══════════════════════════════════════════════════════════════

router.delete("/pages/:id", async (req: Request, res: Response) => {
  try {
    const success = wikiService.archivePage(req.params.id);
    if (!success) {
      return res.status(404).json(errorResponse("Page not found"));
    }

    res.json(successResponse({ id: req.params.id }, "Page archived successfully"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to archive page"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /wiki/pages/:id/revisions — Revision history
// ══════════════════════════════════════════════════════════════

router.get("/pages/:id/revisions", async (req: Request, res: Response) => {
  try {
    const page = wikiService.getPage(req.params.id, false);
    if (!page) {
      return res.status(404).json(errorResponse("Page not found"));
    }

    const revisions = wikiService.getRevisions(req.params.id);
    res.json(successResponse(revisions, undefined, { total: revisions.length }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch revisions"));
  }
});

// ══════════════════════════════════════════════════════════════
// POST /wiki/pages/:id/revisions/:revId/restore — Restore revision
// ══════════════════════════════════════════════════════════════

router.post("/pages/:id/revisions/:revId/restore", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.userId || "system";
    const userName = req.body.userName || (req as any).user?.firstName || "System";

    const page = await wikiService.restoreRevision(
      req.params.id,
      req.params.revId,
      userId,
      userName,
    );

    if (!page) {
      return res.status(404).json(errorResponse("Page or revision not found"));
    }

    res.json(successResponse(page, `Restored to revision ${req.params.revId}`));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to restore revision"));
  }
});

// ══════════════════════════════════════════════════════════════
// POST /wiki/pages/:id/comments — Add comment
// ══════════════════════════════════════════════════════════════

router.post("/pages/:id/comments", async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    const userId = (req as any).user?.id || req.body.userId;
    const userName = req.body.userName || (req as any).user?.firstName || "Anonymous";

    if (!content) {
      return res.status(400).json(errorResponse("Comment content is required"));
    }

    const comment = wikiService.addComment(req.params.id, userId || "anon", userName, content);
    if (!comment) {
      return res.status(404).json(errorResponse("Page not found"));
    }

    res.status(201).json(successResponse(comment, "Comment added"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to add comment"));
  }
});

// ══════════════════════════════════════════════════════════════
// POST /wiki/pages/:id/bookmark — Bookmark a page
// ══════════════════════════════════════════════════════════════

router.post("/pages/:id/bookmark", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.userId;
    if (!userId) {
      return res.status(400).json(errorResponse("User ID is required"));
    }

    // Toggle: if already bookmarked, remove; else add
    const isBookmarked = wikiService.isBookmarked(req.params.id, userId);
    if (isBookmarked) {
      wikiService.removeBookmark(req.params.id, userId);
      res.json(successResponse({ bookmarked: false }, "Bookmark removed"));
    } else {
      const success = wikiService.bookmarkPage(req.params.id, userId);
      if (!success) {
        return res.status(404).json(errorResponse("Page not found"));
      }
      res.json(successResponse({ bookmarked: true }, "Page bookmarked"));
    }
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to toggle bookmark"));
  }
});

// ══════════════════════════════════════════════════════════════
// Export
// ══════════════════════════════════════════════════════════════

export const wikiRouter = router;

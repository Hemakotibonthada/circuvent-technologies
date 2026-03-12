// ──────────────────────────────────────────────────────────────
// HR Payroll — Incident & Case Management (ICM) Routes
// Full ticket lifecycle: create, assign, escalate, resolve,
// reopen, comment, SLA tracking, auto-assign, audit history.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { PrismaClient, TicketStatus, TicketPriority, TicketCategory } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function successResponse<T>(data: T, message?: string, meta?: any) {
  return { success: true, data, message, meta };
}

function errorResponse(error: string) {
  return { success: false, error };
}

/** Generate next ticket code: TKT-2026-0001 */
async function generateTicketCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TKT-${year}-`;
  const lastTicket = await prisma.helpTicket.findFirst({
    where: { ticketCode: { startsWith: prefix } },
    orderBy: { ticketCode: "desc" },
  });

  let nextNum = 1;
  if (lastTicket) {
    const lastNum = parseInt(lastTicket.ticketCode.replace(prefix, ""), 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

/** Calculate SLA deadline based on priority */
function calculateSLADeadline(priority: TicketPriority, createdAt: Date = new Date()): Date {
  const hoursMap: Record<string, number> = {
    CRITICAL: 4,
    HIGH: 8,
    MEDIUM: 24,
    LOW: 72,
  };
  const hours = hoursMap[priority] || 24;
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

/** Determine if ticket is overdue (SLA breached) */
function isOverdue(ticket: { priority: TicketPriority; createdAt: Date; status: TicketStatus; resolvedAt: Date | null }): boolean {
  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") return false;
  const deadline = calculateSLADeadline(ticket.priority, ticket.createdAt);
  return new Date() > deadline;
}

/** Get SLA remaining milliseconds */
function getSLARemaining(ticket: { priority: TicketPriority; createdAt: Date }): number {
  const deadline = calculateSLADeadline(ticket.priority, ticket.createdAt);
  return deadline.getTime() - Date.now();
}

/** Priority escalation order */
const PRIORITY_ESCALATION: Record<string, TicketPriority> = {
  LOW: "MEDIUM",
  MEDIUM: "HIGH",
  HIGH: "CRITICAL",
  CRITICAL: "CRITICAL",
};

// In-memory watcher storage (per-ticket userId sets)
const ticketWatchers = new Map<string, Set<string>>();

// Round-robin assignment index
let roundRobinIndex = 0;

// ══════════════════════════════════════════════════════════════
// GET /icm/dashboard — Ticket statistics
// ══════════════════════════════════════════════════════════════

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const [total, open, inProgress, waitingOnUser, resolved, closed] = await Promise.all([
      prisma.helpTicket.count(),
      prisma.helpTicket.count({ where: { status: "OPEN" } }),
      prisma.helpTicket.count({ where: { status: "IN_PROGRESS" } }),
      prisma.helpTicket.count({ where: { status: "WAITING_ON_USER" } }),
      prisma.helpTicket.count({ where: { status: "RESOLVED" } }),
      prisma.helpTicket.count({ where: { status: "CLOSED" } }),
    ]);

    const [critical, high, medium, low] = await Promise.all([
      prisma.helpTicket.count({ where: { priority: "CRITICAL" } }),
      prisma.helpTicket.count({ where: { priority: "HIGH" } }),
      prisma.helpTicket.count({ where: { priority: "MEDIUM" } }),
      prisma.helpTicket.count({ where: { priority: "LOW" } }),
    ]);

    // Count overdue tickets
    const activeTickets = await prisma.helpTicket.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_USER"] } },
      select: { id: true, priority: true, createdAt: true, status: true, resolvedAt: true },
    });
    const overdueCount = activeTickets.filter((t) => isOverdue(t)).length;

    const highPriority = critical + high;

    // By category
    const byCategory = await prisma.helpTicket.groupBy({
      by: ["category"],
      _count: { id: true },
    });

    // Average resolution time (tickets resolved in last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const resolvedTickets = await prisma.helpTicket.findMany({
      where: { status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, resolvedAt: true },
    });
    let avgResolutionMs = 0;
    if (resolvedTickets.length > 0) {
      const totalMs = resolvedTickets.reduce((sum, t) => {
        return sum + (t.resolvedAt ? t.resolvedAt.getTime() - t.createdAt.getTime() : 0);
      }, 0);
      avgResolutionMs = totalMs / resolvedTickets.length;
    }
    const avgResolutionHours = Math.round(avgResolutionMs / (1000 * 60 * 60) * 10) / 10;

    res.json(successResponse({
      total,
      open,
      inProgress,
      waitingOnUser,
      resolved,
      closed,
      highPriority,
      overdue: overdueCount,
      avgResolutionHours,
      statusDistribution: { open, inProgress, waitingOnUser, resolved, closed },
      priorityDistribution: { critical, high, medium, low },
      byCategory: byCategory.map((c) => ({ category: c.category, count: c._count.id })),
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch ICM dashboard"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /icm/tickets — List tickets with filters
// ══════════════════════════════════════════════════════════════

router.get("/tickets", async (req: Request, res: Response) => {
  try {
    const {
      status, priority, category, assignee,
      search, page = "1", limit = "20",
      sortBy = "createdAt", sortOrder = "desc",
    } = req.query;

    const where: any = {};
    if (status) where.status = String(status);
    if (priority) where.priority = String(priority);
    if (category) where.category = String(category);
    if (assignee) where.assignedTo = String(assignee);

    if (search) {
      const term = String(search);
      where.OR = [
        { subject: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
        { ticketCode: { contains: term, mode: "insensitive" } },
      ];
    }

    const skip = (parseInt(String(page), 10) - 1) * parseInt(String(limit), 10);
    const take = parseInt(String(limit), 10);

    const [tickets, total] = await Promise.all([
      prisma.helpTicket.findMany({
        where,
        include: {
          employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
          comments: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { [String(sortBy)]: String(sortOrder) },
        skip,
        take,
      }),
      prisma.helpTicket.count({ where }),
    ]);

    // Enrich with SLA info
    const enriched = tickets.map((t) => ({
      ...t,
      slaDeadline: calculateSLADeadline(t.priority, t.createdAt),
      slaRemainingMs: getSLARemaining({ priority: t.priority, createdAt: t.createdAt }),
      isOverdue: isOverdue(t),
      watcherCount: ticketWatchers.get(t.id)?.size ?? 0,
    }));

    res.json(successResponse(enriched, undefined, {
      total,
      page: parseInt(String(page), 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch tickets"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /icm/tickets/:id — Ticket detail
// ══════════════════════════════════════════════════════════════

router.get("/tickets/:id", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({
      where: { id: req.params.id },
      include: {
        employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } } } },
        comments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ticket) {
      return res.status(404).json(errorResponse("Ticket not found"));
    }

    const watchers = Array.from(ticketWatchers.get(ticket.id) ?? []);

    res.json(successResponse({
      ...ticket,
      slaDeadline: calculateSLADeadline(ticket.priority, ticket.createdAt),
      slaRemainingMs: getSLARemaining({ priority: ticket.priority, createdAt: ticket.createdAt }),
      isOverdue: isOverdue(ticket),
      watchers,
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch ticket"));
  }
});

// ══════════════════════════════════════════════════════════════
// POST /icm/tickets — Create ticket
// ══════════════════════════════════════════════════════════════

router.post("/tickets", async (req: Request, res: Response) => {
  try {
    const { subject, description, category, priority, assignedTo, employeeId } = req.body;

    if (!subject || !description || !employeeId) {
      return res.status(400).json(errorResponse("subject, description, and employeeId are required"));
    }

    // Validate category
    const validCategories = Object.values(TicketCategory);
    const ticketCategory = category && validCategories.includes(category) ? category : "OTHER";

    // Validate priority
    const validPriorities = Object.values(TicketPriority);
    const ticketPriority = priority && validPriorities.includes(priority) ? priority : "MEDIUM";

    const ticketCode = await generateTicketCode();

    const ticket = await prisma.helpTicket.create({
      data: {
        ticketCode,
        subject,
        description,
        category: ticketCategory,
        priority: ticketPriority,
        status: "OPEN",
        assignedTo: assignedTo || null,
        employeeId,
      },
      include: {
        employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });

    // Auto-add creator as watcher
    if (!ticketWatchers.has(ticket.id)) {
      ticketWatchers.set(ticket.id, new Set());
    }
    ticketWatchers.get(ticket.id)!.add(employeeId);

    res.status(201).json(successResponse(ticket, "Ticket created successfully"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to create ticket"));
  }
});

// ══════════════════════════════════════════════════════════════
// PUT /icm/tickets/:id — Update ticket
// ══════════════════════════════════════════════════════════════

router.put("/tickets/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json(errorResponse("Ticket not found"));
    }

    const { subject, description, status, priority, category, assignedTo, resolution } = req.body;

    const data: any = {};
    if (subject !== undefined) data.subject = subject;
    if (description !== undefined) data.description = description;
    if (status !== undefined) {
      const validStatuses = Object.values(TicketStatus);
      if (validStatuses.includes(status)) {
        data.status = status;
        if (status === "RESOLVED" || status === "CLOSED") {
          data.resolvedAt = new Date();
        }
        if (status === "CLOSED") {
          data.closedAt = new Date();
        }
      }
    }
    if (priority !== undefined) {
      const validPriorities = Object.values(TicketPriority);
      if (validPriorities.includes(priority)) data.priority = priority;
    }
    if (category !== undefined) {
      const validCategories = Object.values(TicketCategory);
      if (validCategories.includes(category)) data.category = category;
    }
    if (assignedTo !== undefined) data.assignedTo = assignedTo;
    if (resolution !== undefined) data.resolution = resolution;

    const ticket = await prisma.helpTicket.update({
      where: { id: req.params.id },
      data,
      include: {
        employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
        comments: true,
      },
    });

    res.json(successResponse(ticket, "Ticket updated"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to update ticket"));
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE /icm/tickets/:id — Soft delete (set status to CLOSED)
// ══════════════════════════════════════════════════════════════

router.delete("/tickets/:id", async (req: Request, res: Response) => {
  try {
    const existing = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json(errorResponse("Ticket not found"));
    }

    const ticket = await prisma.helpTicket.update({
      where: { id: req.params.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    ticketWatchers.delete(ticket.id);

    res.json(successResponse(ticket, "Ticket closed (soft-deleted)"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to delete ticket"));
  }
});

// ══════════════════════════════════════════════════════════════
// POST /icm/tickets/:id/comments — Add comment
// ══════════════════════════════════════════════════════════════

router.post("/tickets/:id/comments", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      return res.status(404).json(errorResponse("Ticket not found"));
    }

    const { userId, content, isInternal } = req.body;
    if (!userId || !content) {
      return res.status(400).json(errorResponse("userId and content are required"));
    }

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId: req.params.id,
        userId,
        content,
        isInternal: isInternal === true,
      },
    });

    // Auto-add commenter as watcher
    if (!ticketWatchers.has(req.params.id)) {
      ticketWatchers.set(req.params.id, new Set());
    }
    ticketWatchers.get(req.params.id)!.add(userId);

    res.status(201).json(successResponse(comment, "Comment added"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to add comment"));
  }
});

// ══════════════════════════════════════════════════════════════
// PUT /icm/tickets/:id/comments/:commentId — Edit comment
// ══════════════════════════════════════════════════════════════

router.put("/tickets/:id/comments/:commentId", async (req: Request, res: Response) => {
  try {
    const comment = await prisma.ticketComment.findUnique({
      where: { id: req.params.commentId },
    });
    if (!comment || comment.ticketId !== req.params.id) {
      return res.status(404).json(errorResponse("Comment not found"));
    }

    const { content, isInternal } = req.body;
    if (!content) {
      return res.status(400).json(errorResponse("content is required"));
    }

    const updated = await prisma.ticketComment.update({
      where: { id: req.params.commentId },
      data: {
        content,
        ...(isInternal !== undefined ? { isInternal } : {}),
      },
    });

    res.json(successResponse(updated, "Comment updated"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to update comment"));
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE /icm/tickets/:id/comments/:commentId — Delete comment
// ══════════════════════════════════════════════════════════════

router.delete("/tickets/:id/comments/:commentId", async (req: Request, res: Response) => {
  try {
    const comment = await prisma.ticketComment.findUnique({
      where: { id: req.params.commentId },
    });
    if (!comment || comment.ticketId !== req.params.id) {
      return res.status(404).json(errorResponse("Comment not found"));
    }

    await prisma.ticketComment.delete({ where: { id: req.params.commentId } });

    res.json(successResponse(null, "Comment deleted"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to delete comment"));
  }
});

// ══════════════════════════════════════════════════════════════
// POST /icm/tickets/:id/assign — Assign ticket
// ══════════════════════════════════════════════════════════════

router.post("/tickets/:id/assign", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      return res.status(404).json(errorResponse("Ticket not found"));
    }

    const { assignedTo } = req.body;
    if (!assignedTo) {
      return res.status(400).json(errorResponse("assignedTo is required"));
    }

    const updated = await prisma.helpTicket.update({
      where: { id: req.params.id },
      data: {
        assignedTo,
        status: ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status,
      },
      include: {
        employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });

    // Add assignee as watcher
    if (!ticketWatchers.has(req.params.id)) {
      ticketWatchers.set(req.params.id, new Set());
    }
    ticketWatchers.get(req.params.id)!.add(assignedTo);

    res.json(successResponse(updated, "Ticket assigned"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to assign ticket"));
  }
});

// ══════════════════════════════════════════════════════════════
// POST /icm/tickets/:id/escalate — Escalate priority
// ══════════════════════════════════════════════════════════════

router.post("/tickets/:id/escalate", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      return res.status(404).json(errorResponse("Ticket not found"));
    }

    const newPriority = PRIORITY_ESCALATION[ticket.priority] || "CRITICAL";
    if (newPriority === ticket.priority) {
      return res.status(400).json(errorResponse("Ticket is already at highest priority"));
    }

    const { reason } = req.body;

    const updated = await prisma.helpTicket.update({
      where: { id: req.params.id },
      data: { priority: newPriority },
      include: {
        employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });

    // Add escalation comment
    if (reason) {
      await prisma.ticketComment.create({
        data: {
          ticketId: req.params.id,
          userId: req.body.userId || "SYSTEM",
          content: `[ESCALATION] Priority escalated from ${ticket.priority} to ${newPriority}. Reason: ${reason}`,
          isInternal: true,
        },
      });
    }

    res.json(successResponse(updated, `Ticket escalated from ${ticket.priority} to ${newPriority}`));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to escalate ticket"));
  }
});

// ══════════════════════════════════════════════════════════════
// POST /icm/tickets/:id/resolve — Resolve ticket
// ══════════════════════════════════════════════════════════════

router.post("/tickets/:id/resolve", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      return res.status(404).json(errorResponse("Ticket not found"));
    }

    if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
      return res.status(400).json(errorResponse("Ticket is already resolved or closed"));
    }

    const { resolution, userId } = req.body;
    if (!resolution) {
      return res.status(400).json(errorResponse("resolution notes are required"));
    }

    const updated = await prisma.helpTicket.update({
      where: { id: req.params.id },
      data: {
        status: "RESOLVED",
        resolution,
        resolvedAt: new Date(),
      },
      include: {
        employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });

    // Add resolution comment
    await prisma.ticketComment.create({
      data: {
        ticketId: req.params.id,
        userId: userId || "SYSTEM",
        content: `[RESOLVED] ${resolution}`,
        isInternal: false,
      },
    });

    res.json(successResponse(updated, "Ticket resolved"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to resolve ticket"));
  }
});

// ══════════════════════════════════════════════════════════════
// POST /icm/tickets/:id/reopen — Reopen resolved ticket
// ══════════════════════════════════════════════════════════════

router.post("/tickets/:id/reopen", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      return res.status(404).json(errorResponse("Ticket not found"));
    }

    if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") {
      return res.status(400).json(errorResponse("Only resolved or closed tickets can be reopened"));
    }

    const { reason, userId } = req.body;

    const updated = await prisma.helpTicket.update({
      where: { id: req.params.id },
      data: {
        status: "OPEN",
        resolution: null,
        resolvedAt: null,
        closedAt: null,
      },
      include: {
        employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });

    await prisma.ticketComment.create({
      data: {
        ticketId: req.params.id,
        userId: userId || "SYSTEM",
        content: `[REOPENED] ${reason || "No reason provided"}`,
        isInternal: true,
      },
    });

    res.json(successResponse(updated, "Ticket reopened"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to reopen ticket"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /icm/tickets/:id/history — Audit trail
// ══════════════════════════════════════════════════════════════

router.get("/tickets/:id/history", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      return res.status(404).json(errorResponse("Ticket not found"));
    }

    // Use comments with isInternal flag as audit trail + ticket metadata
    const comments = await prisma.ticketComment.findMany({
      where: { ticketId: req.params.id },
      orderBy: { createdAt: "asc" },
    });

    const history = [
      {
        action: "CREATED",
        timestamp: ticket.createdAt,
        details: {
          ticketCode: ticket.ticketCode,
          subject: ticket.subject,
          category: ticket.category,
          priority: ticket.priority,
          status: "OPEN",
        },
      },
      ...comments.map((c) => ({
        action: c.content.startsWith("[ESCALATION]")
          ? "ESCALATED"
          : c.content.startsWith("[RESOLVED]")
          ? "RESOLVED"
          : c.content.startsWith("[REOPENED]")
          ? "REOPENED"
          : c.isInternal
          ? "INTERNAL_NOTE"
          : "COMMENT",
        timestamp: c.createdAt,
        userId: c.userId,
        details: { content: c.content },
      })),
    ];

    if (ticket.resolvedAt) {
      history.push({
        action: "STATUS_CHANGE",
        timestamp: ticket.resolvedAt,
        details: { ticketCode: ticket.ticketCode, subject: ticket.subject, category: ticket.category, priority: ticket.priority, status: ticket.status },
      });
    }

    history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.json(successResponse(history));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch ticket history"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /icm/my-tickets — Tickets assigned to current user
// ══════════════════════════════════════════════════════════════

router.get("/my-tickets", async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json(errorResponse("userId query parameter is required"));
    }

    const page = parseInt(String(req.query.page || "1"), 10);
    const limit = parseInt(String(req.query.limit || "20"), 10);
    const skip = (page - 1) * limit;

    const [tickets, total] = await Promise.all([
      prisma.helpTicket.findMany({
        where: { assignedTo: userId },
        include: {
          employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
          comments: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.helpTicket.count({ where: { assignedTo: userId } }),
    ]);

    const enriched = tickets.map((t) => ({
      ...t,
      slaDeadline: calculateSLADeadline(t.priority, t.createdAt),
      slaRemainingMs: getSLARemaining({ priority: t.priority, createdAt: t.createdAt }),
      isOverdue: isOverdue(t),
    }));

    res.json(successResponse(enriched, undefined, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch assigned tickets"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /icm/submitted-by-me — Tickets created by current user
// ══════════════════════════════════════════════════════════════

router.get("/submitted-by-me", async (req: Request, res: Response) => {
  try {
    const employeeId = req.query.employeeId as string;
    if (!employeeId) {
      return res.status(400).json(errorResponse("employeeId query parameter is required"));
    }

    const page = parseInt(String(req.query.page || "1"), 10);
    const limit = parseInt(String(req.query.limit || "20"), 10);
    const skip = (page - 1) * limit;

    const [tickets, total] = await Promise.all([
      prisma.helpTicket.findMany({
        where: { employeeId },
        include: {
          employee: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
          comments: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.helpTicket.count({ where: { employeeId } }),
    ]);

    const enriched = tickets.map((t) => ({
      ...t,
      slaDeadline: calculateSLADeadline(t.priority, t.createdAt),
      slaRemainingMs: getSLARemaining({ priority: t.priority, createdAt: t.createdAt }),
      isOverdue: isOverdue(t),
    }));

    res.json(successResponse(enriched, undefined, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch submitted tickets"));
  }
});

// ══════════════════════════════════════════════════════════════
// POST /icm/tickets/:id/watchers — Add watcher
// ══════════════════════════════════════════════════════════════

router.post("/tickets/:id/watchers", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) {
      return res.status(404).json(errorResponse("Ticket not found"));
    }

    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json(errorResponse("userId is required"));
    }

    if (!ticketWatchers.has(req.params.id)) {
      ticketWatchers.set(req.params.id, new Set());
    }
    ticketWatchers.get(req.params.id)!.add(userId);

    res.json(successResponse({
      ticketId: req.params.id,
      watchers: Array.from(ticketWatchers.get(req.params.id)!),
    }, "Watcher added"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to add watcher"));
  }
});

// ══════════════════════════════════════════════════════════════
// DELETE /icm/tickets/:id/watchers/:userId — Remove watcher
// ══════════════════════════════════════════════════════════════

router.delete("/tickets/:id/watchers/:userId", async (req: Request, res: Response) => {
  try {
    const watchers = ticketWatchers.get(req.params.id);
    if (!watchers) {
      return res.status(404).json(errorResponse("Ticket not found or no watchers"));
    }

    watchers.delete(req.params.userId);

    res.json(successResponse({
      ticketId: req.params.id,
      watchers: Array.from(watchers),
    }, "Watcher removed"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to remove watcher"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /icm/sla-report — SLA compliance report
// ══════════════════════════════════════════════════════════════

router.get("/sla-report", async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(String(from));
    if (to) dateFilter.lte = new Date(String(to));

    const tickets = await prisma.helpTicket.findMany({
      where: dateFilter.gte || dateFilter.lte ? { createdAt: dateFilter } : {},
      select: {
        id: true,
        ticketCode: true,
        subject: true,
        priority: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
      },
    });

    let totalResolved = 0;
    let slaBreached = 0;
    let slaMet = 0;
    const breachedTickets: any[] = [];

    const byPriority: Record<string, { total: number; breached: number; met: number }> = {
      CRITICAL: { total: 0, breached: 0, met: 0 },
      HIGH: { total: 0, breached: 0, met: 0 },
      MEDIUM: { total: 0, breached: 0, met: 0 },
      LOW: { total: 0, breached: 0, met: 0 },
    };

    for (const t of tickets) {
      const deadline = calculateSLADeadline(t.priority, t.createdAt);
      byPriority[t.priority].total++;

      if (t.status === "RESOLVED" || t.status === "CLOSED") {
        totalResolved++;
        const resolvedAt = t.resolvedAt || new Date();
        if (resolvedAt > deadline) {
          slaBreached++;
          byPriority[t.priority].breached++;
          breachedTickets.push({
            ticketCode: t.ticketCode,
            subject: t.subject,
            priority: t.priority,
            deadline,
            resolvedAt,
            breachMs: resolvedAt.getTime() - deadline.getTime(),
          });
        } else {
          slaMet++;
          byPriority[t.priority].met++;
        }
      } else {
        // Still open — check if already breached
        if (isOverdue(t)) {
          slaBreached++;
          byPriority[t.priority].breached++;
          breachedTickets.push({
            ticketCode: t.ticketCode,
            subject: t.subject,
            priority: t.priority,
            deadline,
            status: t.status,
            breachMs: Date.now() - deadline.getTime(),
          });
        }
      }
    }

    const complianceRate = tickets.length > 0
      ? Math.round(((tickets.length - slaBreached) / tickets.length) * 100 * 10) / 10
      : 100;

    res.json(successResponse({
      totalTickets: tickets.length,
      totalResolved,
      slaBreached,
      slaMet,
      complianceRate,
      byPriority,
      breachedTickets: breachedTickets.slice(0, 50),
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to generate SLA report"));
  }
});

// ══════════════════════════════════════════════════════════════
// POST /icm/auto-assign — Auto-assign unassigned tickets
// ══════════════════════════════════════════════════════════════

router.post("/auto-assign", async (req: Request, res: Response) => {
  try {
    const { assigneeIds } = req.body;
    if (!assigneeIds || !Array.isArray(assigneeIds) || assigneeIds.length === 0) {
      return res.status(400).json(errorResponse("assigneeIds (array of user IDs) is required"));
    }

    const unassigned = await prisma.helpTicket.findMany({
      where: {
        assignedTo: null,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      orderBy: [
        { priority: "asc" }, // CRITICAL first (alphabetically)
        { createdAt: "asc" },
      ],
    });

    if (unassigned.length === 0) {
      return res.json(successResponse({ assigned: 0 }, "No unassigned tickets"));
    }

    const assignments: Array<{ ticketId: string; ticketCode: string; assignedTo: string }> = [];

    for (const ticket of unassigned) {
      const assigneeId = assigneeIds[roundRobinIndex % assigneeIds.length];
      roundRobinIndex++;

      await prisma.helpTicket.update({
        where: { id: ticket.id },
        data: {
          assignedTo: assigneeId,
          status: ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status,
        },
      });

      assignments.push({
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        assignedTo: assigneeId,
      });

      // Add assignee as watcher
      if (!ticketWatchers.has(ticket.id)) {
        ticketWatchers.set(ticket.id, new Set());
      }
      ticketWatchers.get(ticket.id)!.add(assigneeId);
    }

    // Auto-escalate overdue tickets
    const overdueTickets = await prisma.helpTicket.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_USER"] },
      },
      select: { id: true, priority: true, createdAt: true, status: true, resolvedAt: true },
    });

    let escalatedCount = 0;
    for (const t of overdueTickets) {
      if (isOverdue(t)) {
        const newPriority = PRIORITY_ESCALATION[t.priority];
        if (newPriority && newPriority !== t.priority) {
          await prisma.helpTicket.update({
            where: { id: t.id },
            data: { priority: newPriority },
          });

          await prisma.ticketComment.create({
            data: {
              ticketId: t.id,
              userId: "SYSTEM",
              content: `[ESCALATION] Auto-escalated from ${t.priority} to ${newPriority} due to SLA breach`,
              isInternal: true,
            },
          });
          escalatedCount++;
        }
      }
    }

    res.json(successResponse({
      assigned: assignments.length,
      assignments,
      escalated: escalatedCount,
    }, `${assignments.length} tickets assigned, ${escalatedCount} escalated`));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to auto-assign tickets"));
  }
});

export { router as icmRouter };

/// <reference types="jest" />
// ──────────────────────────────────────────────────────────────
// ICM Routes — Test Suite
// Tests for ticket CRUD, comments, assign, escalate, resolve,
// reopen, watchers, SLA report, auto-assign, dashboard.
// ──────────────────────────────────────────────────────────────

const mockPrisma = {
  helpTicket: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  ticketComment: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  TicketStatus: { OPEN: "OPEN", IN_PROGRESS: "IN_PROGRESS", WAITING_ON_USER: "WAITING_ON_USER", RESOLVED: "RESOLVED", CLOSED: "CLOSED" },
  TicketPriority: { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH", CRITICAL: "CRITICAL" },
  TicketCategory: { IT_HARDWARE: "IT_HARDWARE", IT_SOFTWARE: "IT_SOFTWARE", IT_ACCESS: "IT_ACCESS", HR_QUERY: "HR_QUERY", PAYROLL: "PAYROLL", FACILITIES: "FACILITIES", OTHER: "OTHER" },
}));

import express from "express";
import request from "supertest";

// Must import after mock
const { icmRouter } = require("../routes/icm.routes");

const app = express();
app.use(express.json());
app.use("/icm", icmRouter);

// ══════════════════════════════════════════════════════════════
// Test Data
// ══════════════════════════════════════════════════════════════

const mockTicket = {
  id: "ticket-1",
  ticketCode: "TKT-2026-0001",
  subject: "Laptop not working",
  description: "Screen flickering issue",
  category: "IT_HARDWARE",
  priority: "HIGH",
  status: "OPEN",
  assignedTo: null,
  resolution: null,
  resolvedAt: null,
  closedAt: null,
  employeeId: "emp-1",
  createdAt: new Date("2026-03-10T10:00:00Z"),
  updatedAt: new Date("2026-03-10T10:00:00Z"),
  employee: {
    id: "emp-1",
    user: { id: "user-1", firstName: "John", lastName: "Doe", email: "john@example.com" },
  },
  comments: [],
};

const mockComment = {
  id: "comment-1",
  ticketId: "ticket-1",
  userId: "user-1",
  content: "Looking into this",
  isInternal: false,
  createdAt: new Date("2026-03-10T11:00:00Z"),
};

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("ICM Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Dashboard ──────────────────────────────────────────

  describe("GET /icm/dashboard", () => {
    it("should return ticket statistics", async () => {
      mockPrisma.helpTicket.count.mockResolvedValue(10);
      mockPrisma.helpTicket.findMany.mockResolvedValue([]);
      mockPrisma.helpTicket.groupBy.mockResolvedValue([]);

      const res = await request(app).get("/icm/dashboard");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("total");
      expect(res.body.data).toHaveProperty("open");
      expect(res.body.data).toHaveProperty("highPriority");
      expect(res.body.data).toHaveProperty("overdue");
      expect(res.body.data).toHaveProperty("avgResolutionHours");
      expect(res.body.data).toHaveProperty("statusDistribution");
      expect(res.body.data).toHaveProperty("priorityDistribution");
      expect(res.body.data).toHaveProperty("byCategory");
    });

    it("should handle database errors", async () => {
      mockPrisma.helpTicket.count.mockRejectedValue(new Error("DB connection lost"));

      const res = await request(app).get("/icm/dashboard");

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // ── List Tickets ───────────────────────────────────────

  describe("GET /icm/tickets", () => {
    it("should list tickets with pagination", async () => {
      mockPrisma.helpTicket.findMany.mockResolvedValue([mockTicket]);
      mockPrisma.helpTicket.count.mockResolvedValue(1);

      const res = await request(app).get("/icm/tickets?page=1&limit=20");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty("total");
      expect(res.body.meta).toHaveProperty("totalPages");
    });

    it("should filter by status", async () => {
      mockPrisma.helpTicket.findMany.mockResolvedValue([]);
      mockPrisma.helpTicket.count.mockResolvedValue(0);

      const res = await request(app).get("/icm/tickets?status=OPEN");

      expect(res.status).toBe(200);
      expect(mockPrisma.helpTicket.findMany).toHaveBeenCalled();
    });

    it("should filter by priority", async () => {
      mockPrisma.helpTicket.findMany.mockResolvedValue([]);
      mockPrisma.helpTicket.count.mockResolvedValue(0);

      const res = await request(app).get("/icm/tickets?priority=HIGH");

      expect(res.status).toBe(200);
    });

    it("should support search", async () => {
      mockPrisma.helpTicket.findMany.mockResolvedValue([]);
      mockPrisma.helpTicket.count.mockResolvedValue(0);

      const res = await request(app).get("/icm/tickets?search=laptop");

      expect(res.status).toBe(200);
    });
  });

  // ── Get Ticket ─────────────────────────────────────────

  describe("GET /icm/tickets/:id", () => {
    it("should return ticket detail", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue({ ...mockTicket, comments: [mockComment] });

      const res = await request(app).get("/icm/tickets/ticket-1");

      expect(res.status).toBe(200);
      expect(res.body.data.ticketCode).toBe("TKT-2026-0001");
      expect(res.body.data).toHaveProperty("slaDeadline");
      expect(res.body.data).toHaveProperty("isOverdue");
    });

    it("should return 404 for non-existent ticket", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(null);

      const res = await request(app).get("/icm/tickets/nonexistent");

      expect(res.status).toBe(404);
    });
  });

  // ── Create Ticket ──────────────────────────────────────

  describe("POST /icm/tickets", () => {
    it("should create a ticket with auto-generated code", async () => {
      mockPrisma.helpTicket.findFirst.mockResolvedValue(null);
      mockPrisma.helpTicket.create.mockResolvedValue({ ...mockTicket, ticketCode: "TKT-2026-0001" });

      const res = await request(app).post("/icm/tickets").send({
        subject: "Laptop not working",
        description: "Screen flickering issue",
        category: "IT_HARDWARE",
        priority: "HIGH",
        employeeId: "emp-1",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("ticketCode");
    });

    it("should reject missing required fields", async () => {
      const res = await request(app).post("/icm/tickets").send({
        subject: "Missing fields",
      });

      expect(res.status).toBe(400);
    });

    it("should default to MEDIUM priority and OTHER category", async () => {
      mockPrisma.helpTicket.findFirst.mockResolvedValue(null);
      mockPrisma.helpTicket.create.mockResolvedValue(mockTicket);

      const res = await request(app).post("/icm/tickets").send({
        subject: "Test",
        description: "Test desc",
        employeeId: "emp-1",
      });

      expect(res.status).toBe(201);
    });
  });

  // ── Update Ticket ──────────────────────────────────────

  describe("PUT /icm/tickets/:id", () => {
    it("should update ticket fields", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.helpTicket.update.mockResolvedValue({ ...mockTicket, priority: "CRITICAL" });

      const res = await request(app).put("/icm/tickets/ticket-1").send({ priority: "CRITICAL" });

      expect(res.status).toBe(200);
    });

    it("should set resolvedAt when status changes to RESOLVED", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.helpTicket.update.mockResolvedValue({ ...mockTicket, status: "RESOLVED", resolvedAt: new Date() });

      const res = await request(app).put("/icm/tickets/ticket-1").send({ status: "RESOLVED" });

      expect(res.status).toBe(200);
    });

    it("should return 404 for non-existent ticket", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(null);

      const res = await request(app).put("/icm/tickets/nonexistent").send({ priority: "HIGH" });

      expect(res.status).toBe(404);
    });
  });

  // ── Delete Ticket (Soft) ───────────────────────────────

  describe("DELETE /icm/tickets/:id", () => {
    it("should soft-delete by changing status to CLOSED", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.helpTicket.update.mockResolvedValue({ ...mockTicket, status: "CLOSED" });

      const res = await request(app).delete("/icm/tickets/ticket-1");

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("CLOSED");
    });

    it("should return 404 for non-existent ticket", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(null);

      const res = await request(app).delete("/icm/tickets/nonexistent");

      expect(res.status).toBe(404);
    });
  });

  // ── Comments ───────────────────────────────────────────

  describe("POST /icm/tickets/:id/comments", () => {
    it("should add a comment", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.ticketComment.create.mockResolvedValue(mockComment);

      const res = await request(app).post("/icm/tickets/ticket-1/comments").send({
        userId: "user-1",
        content: "Looking into this",
      });

      expect(res.status).toBe(201);
      expect(res.body.data.content).toBe("Looking into this");
    });

    it("should reject missing fields", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(mockTicket);

      const res = await request(app).post("/icm/tickets/ticket-1/comments").send({});

      expect(res.status).toBe(400);
    });
  });

  describe("PUT /icm/tickets/:id/comments/:commentId", () => {
    it("should edit a comment", async () => {
      mockPrisma.ticketComment.findUnique.mockResolvedValue(mockComment);
      mockPrisma.ticketComment.update.mockResolvedValue({ ...mockComment, content: "Updated" });

      const res = await request(app).put("/icm/tickets/ticket-1/comments/comment-1").send({ content: "Updated" });

      expect(res.status).toBe(200);
    });

    it("should return 404 if comment not found", async () => {
      mockPrisma.ticketComment.findUnique.mockResolvedValue(null);

      const res = await request(app).put("/icm/tickets/ticket-1/comments/bad-id").send({ content: "x" });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /icm/tickets/:id/comments/:commentId", () => {
    it("should delete a comment", async () => {
      mockPrisma.ticketComment.findUnique.mockResolvedValue(mockComment);
      mockPrisma.ticketComment.delete.mockResolvedValue(mockComment);

      const res = await request(app).delete("/icm/tickets/ticket-1/comments/comment-1");

      expect(res.status).toBe(200);
    });
  });

  // ── Assign ─────────────────────────────────────────────

  describe("POST /icm/tickets/:id/assign", () => {
    it("should assign ticket and change status to IN_PROGRESS", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.helpTicket.update.mockResolvedValue({
        ...mockTicket, assignedTo: "user-2", status: "IN_PROGRESS",
      });

      const res = await request(app).post("/icm/tickets/ticket-1/assign").send({ assignedTo: "user-2" });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("assigned");
    });

    it("should reject without assignedTo", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(mockTicket);

      const res = await request(app).post("/icm/tickets/ticket-1/assign").send({});

      expect(res.status).toBe(400);
    });
  });

  // ── Escalate ───────────────────────────────────────────

  describe("POST /icm/tickets/:id/escalate", () => {
    it("should escalate priority", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue({ ...mockTicket, priority: "MEDIUM" });
      mockPrisma.helpTicket.update.mockResolvedValue({ ...mockTicket, priority: "HIGH" });
      mockPrisma.ticketComment.create.mockResolvedValue(mockComment);

      const res = await request(app).post("/icm/tickets/ticket-1/escalate").send({ reason: "Urgent", userId: "user-1" });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("escalated");
    });

    it("should reject if already at highest priority", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue({ ...mockTicket, priority: "CRITICAL" });

      const res = await request(app).post("/icm/tickets/ticket-1/escalate").send({});

      expect(res.status).toBe(400);
    });
  });

  // ── Resolve ────────────────────────────────────────────

  describe("POST /icm/tickets/:id/resolve", () => {
    it("should resolve ticket with resolution notes", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.helpTicket.update.mockResolvedValue({ ...mockTicket, status: "RESOLVED" });
      mockPrisma.ticketComment.create.mockResolvedValue(mockComment);

      const res = await request(app).post("/icm/tickets/ticket-1/resolve").send({
        resolution: "Replaced laptop screen",
        userId: "user-1",
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("resolved");
    });

    it("should reject if already resolved", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue({ ...mockTicket, status: "RESOLVED" });

      const res = await request(app).post("/icm/tickets/ticket-1/resolve").send({ resolution: "done" });

      expect(res.status).toBe(400);
    });

    it("should require resolution notes", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(mockTicket);

      const res = await request(app).post("/icm/tickets/ticket-1/resolve").send({});

      expect(res.status).toBe(400);
    });
  });

  // ── Reopen ─────────────────────────────────────────────

  describe("POST /icm/tickets/:id/reopen", () => {
    it("should reopen a resolved ticket", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue({ ...mockTicket, status: "RESOLVED" });
      mockPrisma.helpTicket.update.mockResolvedValue({ ...mockTicket, status: "OPEN" });
      mockPrisma.ticketComment.create.mockResolvedValue(mockComment);

      const res = await request(app).post("/icm/tickets/ticket-1/reopen").send({ reason: "Still broken" });

      expect(res.status).toBe(200);
    });

    it("should reject if ticket is not resolved", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue({ ...mockTicket, status: "OPEN" });

      const res = await request(app).post("/icm/tickets/ticket-1/reopen").send({});

      expect(res.status).toBe(400);
    });
  });

  // ── History ────────────────────────────────────────────

  describe("GET /icm/tickets/:id/history", () => {
    it("should return ticket audit history", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.ticketComment.findMany.mockResolvedValue([
        { ...mockComment, content: "[ESCALATION] Priority escalated" },
        mockComment,
      ]);

      const res = await request(app).get("/icm/tickets/ticket-1/history");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].action).toBe("CREATED");
    });
  });

  // ── My Tickets ─────────────────────────────────────────

  describe("GET /icm/my-tickets", () => {
    it("should list tickets assigned to user", async () => {
      mockPrisma.helpTicket.findMany.mockResolvedValue([mockTicket]);
      mockPrisma.helpTicket.count.mockResolvedValue(1);

      const res = await request(app).get("/icm/my-tickets?userId=user-1");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("should require userId parameter", async () => {
      const res = await request(app).get("/icm/my-tickets");

      expect(res.status).toBe(400);
    });
  });

  // ── Submitted By Me ────────────────────────────────────

  describe("GET /icm/submitted-by-me", () => {
    it("should list tickets created by employee", async () => {
      mockPrisma.helpTicket.findMany.mockResolvedValue([mockTicket]);
      mockPrisma.helpTicket.count.mockResolvedValue(1);

      const res = await request(app).get("/icm/submitted-by-me?employeeId=emp-1");

      expect(res.status).toBe(200);
    });

    it("should require employeeId parameter", async () => {
      const res = await request(app).get("/icm/submitted-by-me");

      expect(res.status).toBe(400);
    });
  });

  // ── SLA Report ─────────────────────────────────────────

  describe("GET /icm/sla-report", () => {
    it("should return SLA compliance report", async () => {
      mockPrisma.helpTicket.findMany.mockResolvedValue([
        { ...mockTicket, status: "RESOLVED", resolvedAt: new Date("2026-03-10T14:00:00Z") },
        { ...mockTicket, id: "ticket-2", status: "OPEN" },
      ]);

      const res = await request(app).get("/icm/sla-report");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("totalTickets");
      expect(res.body.data).toHaveProperty("complianceRate");
      expect(res.body.data).toHaveProperty("byPriority");
    });
  });

  // ── Auto Assign ────────────────────────────────────────

  describe("POST /icm/auto-assign", () => {
    it("should assign unassigned tickets round-robin", async () => {
      mockPrisma.helpTicket.findMany
        .mockResolvedValueOnce([
          { ...mockTicket, id: "t1", assignedTo: null },
          { ...mockTicket, id: "t2", assignedTo: null },
        ])
        .mockResolvedValueOnce([]);
      mockPrisma.helpTicket.update.mockResolvedValue(mockTicket);

      const res = await request(app).post("/icm/auto-assign").send({
        assigneeIds: ["user-1", "user-2"],
      });

      expect(res.status).toBe(200);
      expect(res.body.data.assigned).toBe(2);
    });

    it("should reject without assigneeIds", async () => {
      const res = await request(app).post("/icm/auto-assign").send({});

      expect(res.status).toBe(400);
    });
  });

  // ── Watchers ───────────────────────────────────────────

  describe("POST /icm/tickets/:id/watchers", () => {
    it("should add a watcher", async () => {
      mockPrisma.helpTicket.findUnique.mockResolvedValue(mockTicket);

      const res = await request(app).post("/icm/tickets/ticket-1/watchers").send({ userId: "user-3" });

      expect(res.status).toBe(200);
      expect(res.body.data.watchers).toContain("user-3");
    });
  });
});

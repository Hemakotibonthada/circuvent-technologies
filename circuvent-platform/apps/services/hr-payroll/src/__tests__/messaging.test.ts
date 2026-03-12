// ──────────────────────────────────────────────────────────────
// Messaging Routes — Test Suite
// Tests for conversations, messages, reactions, read receipts,
// pin, archive, search, typing indicators, dashboard.
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
  notification: {
    create: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import express from "express";
import request from "supertest";

const { messagingRouter } = require("../routes/messaging.routes");

const app = express();
app.use(express.json());
app.use("/messages", messagingRouter);

// ══════════════════════════════════════════════════════════════
// Test Data
// ══════════════════════════════════════════════════════════════

const mockConversation = {
  id: "conv-1",
  name: "Team Chat",
  entityType: "MSG_CONVERSATION",
  category: "MESSAGING",
  data: {
    type: "group",
    members: ["user-1", "user-2", "user-3"],
    adminIds: ["user-1"],
    pinned: false,
    archived: false,
    createdBy: "user-1",
  },
  createdAt: new Date("2026-03-01"),
  generatedBy: "user-1",
};

const mockDirectConv = {
  id: "conv-dm",
  name: "Direct Message",
  entityType: "MSG_CONVERSATION",
  data: {
    type: "direct",
    members: ["user-1", "user-4"],
    adminIds: ["user-1"],
    pinned: false,
    archived: false,
  },
  createdAt: new Date("2026-03-02"),
  generatedBy: "user-1",
};

const mockMessage = {
  id: "msg-1",
  name: "Message by user-1",
  entityType: "MSG_MESSAGE",
  entityId: "conv-1",
  category: "MESSAGING",
  data: {
    content: "Hello everyone!",
    senderId: "user-1",
    attachments: [],
    edited: false,
    deleted: false,
  },
  createdAt: new Date("2026-03-01T12:00:00Z"),
  generatedBy: "user-1",
};

const mockReaction = {
  id: "react-1",
  entityType: "MSG_REACTION",
  entityId: "msg-1",
  data: { emoji: "👍", userId: "user-2" },
  createdAt: new Date(),
  generatedBy: "user-2",
};

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("Messaging Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Conversations ──────────────────────────────────────

  describe("GET /messages/conversations", () => {
    it("should list user conversations", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([mockConversation]);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(mockMessage);
      mockPrisma.generatedDocument.count.mockResolvedValue(5);

      const res = await request(app).get("/messages/conversations?userId=user-1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("should require userId parameter", async () => {
      const res = await request(app).get("/messages/conversations");

      expect(res.status).toBe(400);
    });

    it("should filter out conversations where user is not a member", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([mockConversation]);
      mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
      mockPrisma.generatedDocument.count.mockResolvedValue(0);

      const res = await request(app).get("/messages/conversations?userId=user-999");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe("POST /messages/conversations", () => {
    it("should create a group conversation", async () => {
      mockPrisma.generatedDocument.create.mockResolvedValue(mockConversation);

      const res = await request(app).post("/messages/conversations").send({
        name: "Team Chat",
        type: "group",
        members: ["user-2", "user-3"],
        userId: "user-1",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it("should find existing direct conversation", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([mockDirectConv]);

      const res = await request(app).post("/messages/conversations").send({
        type: "direct",
        members: ["user-4"],
        userId: "user-1",
      });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe("conv-dm");
    });

    it("should reject missing members", async () => {
      const res = await request(app).post("/messages/conversations").send({
        userId: "user-1",
      });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /messages/conversations/:id", () => {
    it("should return conversation detail with messages", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.generatedDocument.findMany
        .mockResolvedValueOnce([mockMessage])
        .mockResolvedValueOnce([]); // reactions
      mockPrisma.generatedDocument.count.mockResolvedValue(1);

      const res = await request(app).get("/messages/conversations/conv-1");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("messages");
      expect(res.body.data.name).toBe("Team Chat");
    });

    it("should return 404 for non-existent conversation", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(null);

      const res = await request(app).get("/messages/conversations/bad-id");

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /messages/conversations/:id", () => {
    it("should update conversation name", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.generatedDocument.update.mockResolvedValue({ ...mockConversation, name: "Updated" });

      const res = await request(app).put("/messages/conversations/conv-1").send({ name: "Updated" });

      expect(res.status).toBe(200);
    });

    it("should add and remove members", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.generatedDocument.update.mockResolvedValue(mockConversation);

      const res = await request(app).put("/messages/conversations/conv-1").send({
        addMembers: ["user-5"],
        removeMembers: ["user-3"],
      });

      expect(res.status).toBe(200);
    });
  });

  // ── Messages ───────────────────────────────────────────

  describe("POST /messages/conversations/:id/messages", () => {
    it("should send a message", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.generatedDocument.create.mockResolvedValue(mockMessage);
      mockPrisma.notification.create.mockResolvedValue({});

      const res = await request(app).post("/messages/conversations/conv-1/messages").send({
        content: "Hello!",
        userId: "user-1",
      });

      expect(res.status).toBe(201);
      expect(res.body.data.content).toBe("Hello everyone!");
    });

    it("should reject if user is not a member", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockConversation);

      const res = await request(app).post("/messages/conversations/conv-1/messages").send({
        content: "Hello!",
        userId: "user-999",
      });

      expect(res.status).toBe(403);
    });

    it("should reject missing content", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockConversation);

      const res = await request(app).post("/messages/conversations/conv-1/messages").send({
        userId: "user-1",
      });

      expect(res.status).toBe(400);
    });
  });

  describe("PUT /messages/messages/:id", () => {
    it("should edit own message", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.generatedDocument.update.mockResolvedValue({
        ...mockMessage, data: { ...mockMessage.data, content: "Edited", edited: true },
      });

      const res = await request(app).put("/messages/messages/msg-1").send({
        content: "Edited",
        userId: "user-1",
      });

      expect(res.status).toBe(200);
    });

    it("should reject editing others messages", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockMessage);

      const res = await request(app).put("/messages/messages/msg-1").send({
        content: "Hack",
        userId: "user-2",
      });

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /messages/messages/:id", () => {
    it("should soft-delete a message", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.generatedDocument.update.mockResolvedValue({
        ...mockMessage, data: { ...mockMessage.data, deleted: true },
      });

      const res = await request(app).delete("/messages/messages/msg-1");

      expect(res.status).toBe(200);
    });
  });

  // ── Reactions ──────────────────────────────────────────

  describe("POST /messages/messages/:id/reactions", () => {
    it("should add a reaction", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.generatedDocument.findMany.mockResolvedValue([]);
      mockPrisma.generatedDocument.create.mockResolvedValue(mockReaction);

      const res = await request(app).post("/messages/messages/msg-1/reactions").send({
        emoji: "👍",
        userId: "user-2",
      });

      expect(res.status).toBe(201);
    });

    it("should reject duplicate reaction", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.generatedDocument.findMany.mockResolvedValue([mockReaction]);

      const res = await request(app).post("/messages/messages/msg-1/reactions").send({
        emoji: "👍",
        userId: "user-2",
      });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /messages/messages/:id/reactions/:emoji", () => {
    it("should remove a reaction", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([mockReaction]);
      mockPrisma.generatedDocument.delete.mockResolvedValue(mockReaction);

      const res = await request(app).delete("/messages/messages/msg-1/reactions/👍?userId=user-2");

      expect(res.status).toBe(200);
    });

    it("should return 404 if reaction not found", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([]);

      const res = await request(app).delete("/messages/messages/msg-1/reactions/❤️?userId=user-2");

      expect(res.status).toBe(404);
    });
  });

  // ── Read / Unread ──────────────────────────────────────

  describe("GET /messages/unread", () => {
    it("should return unread counts", async () => {
      mockPrisma.generatedDocument.findMany.mockResolvedValue([mockConversation]);
      mockPrisma.generatedDocument.count.mockResolvedValue(3);

      const res = await request(app).get("/messages/unread?userId=user-1");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("totalUnread");
      expect(res.body.data).toHaveProperty("perConversation");
    });

    it("should require userId", async () => {
      const res = await request(app).get("/messages/unread");

      expect(res.status).toBe(400);
    });
  });

  describe("POST /messages/conversations/:id/read", () => {
    it("should mark conversation as read", async () => {
      const res = await request(app).post("/messages/conversations/conv-1/read").send({
        userId: "user-1",
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("readAt");
    });

    it("should require userId", async () => {
      const res = await request(app).post("/messages/conversations/conv-1/read").send({});

      expect(res.status).toBe(400);
    });
  });

  // ── Archive / Pin ──────────────────────────────────────

  describe("POST /messages/conversations/:id/archive", () => {
    it("should archive a conversation", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.generatedDocument.update.mockResolvedValue(mockConversation);

      const res = await request(app).post("/messages/conversations/conv-1/archive");

      expect(res.status).toBe(200);
    });
  });

  describe("POST /messages/conversations/:id/unarchive", () => {
    it("should unarchive a conversation", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue({
        ...mockConversation, data: { ...mockConversation.data, archived: true },
      });
      mockPrisma.generatedDocument.update.mockResolvedValue(mockConversation);

      const res = await request(app).post("/messages/conversations/conv-1/unarchive");

      expect(res.status).toBe(200);
    });
  });

  describe("POST /messages/conversations/:id/pin", () => {
    it("should toggle pin on a conversation", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.generatedDocument.update.mockResolvedValue(mockConversation);

      const res = await request(app).post("/messages/conversations/conv-1/pin");

      expect(res.status).toBe(200);
    });
  });

  // ── Search ─────────────────────────────────────────────

  describe("GET /messages/search", () => {
    it("should search messages within user conversations", async () => {
      mockPrisma.generatedDocument.findMany
        .mockResolvedValueOnce([mockConversation])
        .mockResolvedValueOnce([mockMessage]);

      const res = await request(app).get("/messages/search?query=hello&userId=user-1");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("should require query and userId", async () => {
      const res = await request(app).get("/messages/search");

      expect(res.status).toBe(400);
    });
  });

  // ── Members ────────────────────────────────────────────

  describe("GET /messages/conversations/:id/members", () => {
    it("should list conversation members", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1", firstName: "John", lastName: "Doe", email: "john@example.com",
      });

      const res = await request(app).get("/messages/conversations/conv-1/members");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("should return 404 for non-existent conversation", async () => {
      mockPrisma.generatedDocument.findUnique.mockResolvedValue(null);

      const res = await request(app).get("/messages/conversations/bad-id/members");

      expect(res.status).toBe(404);
    });
  });

  // ── Typing Indicator ───────────────────────────────────

  describe("POST /messages/conversations/:id/typing", () => {
    it("should set typing indicator", async () => {
      const res = await request(app).post("/messages/conversations/conv-1/typing").send({
        userId: "user-1",
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("typing");
      expect(res.body.data.typing).toContain("user-1");
    });

    it("should require userId", async () => {
      const res = await request(app).post("/messages/conversations/conv-1/typing").send({});

      expect(res.status).toBe(400);
    });
  });

  // ── Dashboard ──────────────────────────────────────────

  describe("GET /messages/dashboard", () => {
    it("should return messaging stats", async () => {
      mockPrisma.generatedDocument.count.mockResolvedValue(10);
      mockPrisma.generatedDocument.findMany.mockResolvedValue([]);

      const res = await request(app).get("/messages/dashboard");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("totalConversations");
      expect(res.body.data).toHaveProperty("totalMessages");
      expect(res.body.data).toHaveProperty("messagesLast24h");
    });
  });
});

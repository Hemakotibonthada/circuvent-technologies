// ──────────────────────────────────────────────────────────────
// ConversationService — Test Suite
// Tests for conversations, messages, reactions, read receipts,
// search, pinning, archiving, forwarding, recent contacts.
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

import { ConversationService } from "../services/conversation.service";

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

let service: ConversationService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new ConversationService();
});

// ══════════════════════════════════════════════════════════════
// Conversation CRUD
// ══════════════════════════════════════════════════════════════

describe("Conversation CRUD", () => {
  it("should create a direct conversation", async () => {
    mockPrisma.generatedDocument.findMany.mockResolvedValue([]); // no existing
    mockPrisma.generatedDocument.create.mockResolvedValue({
      id: "convo-1",
      name: "Direct Message",
      category: "CONVERSATION",
      generatedBy: "u1",
      createdAt: new Date("2026-03-01"),
      data: {
        type: "DIRECT",
        memberIds: ["u1", "u2"],
        members: [],
        lastMessageAt: null,
        lastMessagePreview: null,
      },
    });

    const convo = await service.createDirectConversation("u1", "u2");
    expect(convo.type).toBe("DIRECT");
    expect(convo.memberIds).toContain("u1");
    expect(convo.memberIds).toContain("u2");
  });

  it("should return existing direct conversation instead of creating duplicate", async () => {
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      {
        id: "existing-convo",
        name: "Direct Message",
        generatedBy: "u1",
        createdAt: new Date(),
        data: { type: "DIRECT", memberIds: ["u1", "u2"], members: [] },
      },
    ]);

    const convo = await service.createDirectConversation("u1", "u2");
    expect(convo.id).toBe("existing-convo");
    expect(mockPrisma.generatedDocument.create).not.toHaveBeenCalled();
  });

  it("should create a group conversation", async () => {
    mockPrisma.generatedDocument.create.mockResolvedValue({
      id: "group-1",
      name: "Team Chat",
      category: "CONVERSATION",
      generatedBy: "u1",
      createdAt: new Date(),
      data: {
        type: "GROUP",
        memberIds: ["u1", "u2", "u3"],
        members: [],
        lastMessageAt: null,
        lastMessagePreview: null,
      },
    });

    const convo = await service.createGroupConversation("Team Chat", ["u2", "u3"], "u1");
    expect(convo.type).toBe("GROUP");
    expect(convo.memberIds).toHaveLength(3);
  });

  it("should get conversation by ID", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "convo-1",
      name: "Test",
      generatedBy: "u1",
      createdAt: new Date(),
      data: { type: "GROUP", memberIds: ["u1", "u2"] },
    });

    const convo = await service.getConversation("convo-1");
    expect(convo).not.toBeNull();
    expect(convo!.id).toBe("convo-1");
  });

  it("should return null for non-existent conversation", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue(null);
    const convo = await service.getConversation("nonexistent");
    expect(convo).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Member Management
// ══════════════════════════════════════════════════════════════

describe("Member Management", () => {
  it("should add a member to group conversation", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "convo-1",
      data: {
        type: "GROUP",
        memberIds: ["u1", "u2"],
        members: [{ userId: "u1" }, { userId: "u2" }],
      },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});
    mockPrisma.generatedDocument.create.mockResolvedValue({ id: "msg-sys" });

    // Mock for sendMessage updating convo
    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "convo-1",
      data: {
        type: "GROUP",
        memberIds: ["u1", "u2"],
        members: [{ userId: "u1" }, { userId: "u2" }],
      },
    });

    const success = await service.addMember("convo-1", "u3");
    expect(success).toBe(true);
  });

  it("should not allow adding member to direct conversation", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "convo-1",
      data: { type: "DIRECT", memberIds: ["u1", "u2"], members: [] },
    });

    const success = await service.addMember("convo-1", "u3");
    expect(success).toBe(false);
  });

  it("should remove a member from group conversation", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "convo-1",
      data: {
        type: "GROUP",
        memberIds: ["u1", "u2", "u3"],
        members: [{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }],
      },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});
    mockPrisma.generatedDocument.create.mockResolvedValue({ id: "msg-sys" });

    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "convo-1",
      data: { type: "GROUP", memberIds: ["u1", "u2", "u3"], members: [] },
    });

    const success = await service.removeMember("convo-1", "u3");
    expect(success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Messages
// ══════════════════════════════════════════════════════════════

describe("Messages", () => {
  it("should send a message", async () => {
    mockPrisma.generatedDocument.create.mockResolvedValue({
      id: "msg-1",
      name: "Hello!",
      category: "MESSAGE",
      entityId: "convo-1",
      generatedBy: "u1",
      createdAt: new Date(),
      data: { content: "Hello!", senderId: "u1", type: "TEXT" },
    });

    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "convo-1",
      data: { lastMessageAt: null, lastMessagePreview: null },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const message = await service.sendMessage("convo-1", "u1", "Hello!");
    expect(message.content).toBe("Hello!");
    expect(message.senderId).toBe("u1");
    expect(message.type).toBe("TEXT");
  });

  it("should edit a message", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "msg-1",
      data: { content: "Hello!", deleted: false, editedAt: null },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const edited = await service.editMessage("msg-1", "Hello World!");
    expect(edited).not.toBeNull();
    expect(edited!.content).toBe("Hello World!");
    expect(edited!.editedAt).not.toBeNull();
  });

  it("should not edit a deleted message", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "msg-1",
      data: { content: "Hello!", deleted: true },
    });

    const edited = await service.editMessage("msg-1", "New content");
    expect(edited).toBeNull();
  });

  it("should soft-delete a message", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "msg-1",
      data: { content: "Hello!", deleted: false },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const success = await service.deleteMessage("msg-1");
    expect(success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Reactions
// ══════════════════════════════════════════════════════════════

describe("Reactions", () => {
  it("should add a reaction to a message", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "msg-1",
      data: { reactions: [] },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const success = await service.addReaction("msg-1", "u1", "👍");
    expect(success).toBe(true);
  });

  it("should not duplicate reactions", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "msg-1",
      data: { reactions: [{ userId: "u1", emoji: "👍", createdAt: new Date().toISOString() }] },
    });

    const success = await service.addReaction("msg-1", "u1", "👍");
    expect(success).toBe(true);
    expect(mockPrisma.generatedDocument.update).not.toHaveBeenCalled();
  });

  it("should remove a reaction", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "msg-1",
      data: { reactions: [{ userId: "u1", emoji: "👍" }, { userId: "u2", emoji: "❤️" }] },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const success = await service.removeReaction("msg-1", "u1", "👍");
    expect(success).toBe(true);
  });

  it("should return false when removing non-existent reaction", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "msg-1",
      data: { reactions: [{ userId: "u1", emoji: "👍" }] },
    });

    const success = await service.removeReaction("msg-1", "u2", "👍");
    expect(success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Read Receipts & Unread
// ══════════════════════════════════════════════════════════════

describe("Read Receipts", () => {
  it("should mark conversation as read", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "convo-1",
      data: {
        members: [
          { userId: "u1", lastReadAt: null },
          { userId: "u2", lastReadAt: null },
        ],
      },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const success = await service.markAsRead("convo-1", "u1");
    expect(success).toBe(true);
  });

  it("should return false for non-member", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "convo-1",
      data: {
        members: [{ userId: "u1", lastReadAt: null }],
      },
    });

    const success = await service.markAsRead("convo-1", "u999");
    expect(success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Search
// ══════════════════════════════════════════════════════════════

describe("Message Search", () => {
  it("should search messages across conversations", async () => {
    // getUserConversations
    mockPrisma.generatedDocument.findMany.mockResolvedValueOnce([
      {
        id: "convo-1",
        name: "Chat",
        generatedBy: "u1",
        createdAt: new Date(),
        data: { type: "DIRECT", memberIds: ["u1", "u2"], members: [] },
      },
    ]);

    // searchMessages
    mockPrisma.generatedDocument.findMany.mockResolvedValueOnce([
      { id: "msg-1", data: { content: "Hello world", deleted: false } },
      { id: "msg-2", data: { content: "Goodbye world", deleted: false } },
      { id: "msg-3", data: { content: "Nothing here", deleted: false } },
    ]);

    const results = await service.searchMessages("u1", "world");
    expect(results).toHaveLength(2);
  });
});

// ══════════════════════════════════════════════════════════════
// Pin / Archive / Forward
// ══════════════════════════════════════════════════════════════

describe("Pin & Archive", () => {
  it("should pin a conversation", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "convo-1",
      data: {
        members: [{ userId: "u1", pinned: false, archived: false }],
      },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const success = await service.pinConversation("convo-1", "u1");
    expect(success).toBe(true);
  });

  it("should archive a conversation", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "convo-1",
      data: {
        members: [{ userId: "u1", pinned: false, archived: false }],
      },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const success = await service.archiveConversation("convo-1", "u1");
    expect(success).toBe(true);
  });
});

describe("Forward Message", () => {
  it("should forward a message to another conversation", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValueOnce({
      id: "msg-1",
      data: { content: "Original message", type: "TEXT", deleted: false, attachments: [] },
    });

    mockPrisma.generatedDocument.create.mockResolvedValue({
      id: "msg-fwd",
      name: "[Forwarded]",
      category: "MESSAGE",
      entityId: "convo-2",
      generatedBy: "u1",
      createdAt: new Date(),
      data: {},
    });

    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "convo-2",
      data: { lastMessageAt: null },
    });
    mockPrisma.generatedDocument.update.mockResolvedValue({});

    const fwd = await service.forwardMessage("msg-1", "convo-2", "u1");
    expect(fwd).not.toBeNull();
    expect(fwd!.content).toContain("[Forwarded]");
  });

  it("should not forward deleted message", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "msg-1",
      data: { content: "Deleted", deleted: true },
    });

    const fwd = await service.forwardMessage("msg-1", "convo-2", "u1");
    expect(fwd).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Members & Files
// ══════════════════════════════════════════════════════════════

describe("Members & Shared Files", () => {
  it("should get conversation members", async () => {
    mockPrisma.generatedDocument.findFirst.mockResolvedValue({
      id: "convo-1",
      data: {
        members: [
          { userId: "u1", online: true },
          { userId: "u2", online: false },
        ],
      },
    });

    const members = await service.getConversationMembers("convo-1");
    expect(members).toHaveLength(2);
  });

  it("should get shared files from conversation", async () => {
    mockPrisma.generatedDocument.findMany.mockResolvedValue([
      { id: "msg-1", data: { type: "FILE", content: "doc.pdf", deleted: false, attachments: [{ name: "doc.pdf" }] } },
      { id: "msg-2", data: { type: "TEXT", content: "Hello", deleted: false, attachments: [] } },
      { id: "msg-3", data: { type: "IMAGE", content: "pic.png", deleted: false, attachments: [] } },
    ]);

    const files = await service.getSharedFiles("convo-1");
    expect(files).toHaveLength(2);
  });
});

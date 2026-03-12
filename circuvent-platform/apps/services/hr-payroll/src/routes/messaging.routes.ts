// ──────────────────────────────────────────────────────────────
// HR Payroll — Internal Messaging / Inbox System
// Conversations (direct + group), messages, reactions,
// read receipts, search, pin, archive, typing indicators.
// Data via Notification model + GeneratedDocument with
// category prefixes.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function ok<T>(data: T, message?: string, meta?: any) {
  return { success: true, data, message, meta };
}

function fail(error: string) {
  return { success: false, error };
}

function parseData<T = any>(doc: any): T {
  if (!doc) return {} as T;
  if (typeof doc.data === "string") {
    try { return JSON.parse(doc.data); } catch { return doc.data as any; }
  }
  return (doc.data ?? {}) as T;
}

// Entity type constants for GeneratedDocument storage
const E_CONVERSATION = "MSG_CONVERSATION";
const E_MESSAGE = "MSG_MESSAGE";
const E_REACTION = "MSG_REACTION";

// In-memory typing indicators (conversationId -> {userId, expiresAt})
const typingIndicators = new Map<string, Map<string, number>>();

// In-memory read receipts (conversationId -> Set<userId>)
const readReceipts = new Map<string, Map<string, Date>>();

// ══════════════════════════════════════════════════════════════
// CONVERSATIONS
// ══════════════════════════════════════════════════════════════

// GET /messages/conversations — List conversations
router.get("/conversations", async (req: Request, res: Response) => {
  try {
    const { userId, archived } = req.query;
    if (!userId) {
      return res.status(400).json(fail("userId query parameter is required"));
    }

    const conversations = await prisma.generatedDocument.findMany({
      where: { entityType: E_CONVERSATION },
      orderBy: { createdAt: "desc" },
    });

    // Filter to conversations where user is a member
    const userConversations = conversations
      .map((c) => ({ id: c.id, name: c.name, ...parseData(c), createdAt: c.createdAt }))
      .filter((c) => {
        const members: string[] = c.members || [];
        return members.includes(String(userId));
      })
      .filter((c) => {
        if (archived === "true") return c.archived === true;
        return c.archived !== true;
      });

    // Enrich with unread count and last message
    const enriched = await Promise.all(
      userConversations.map(async (conv) => {
        const lastMsg = await prisma.generatedDocument.findFirst({
          where: { entityType: E_MESSAGE, entityId: conv.id },
          orderBy: { createdAt: "desc" },
        });

        // Unread count
        const userReadAt = readReceipts.get(conv.id)?.get(String(userId));
        let unreadCount = 0;
        if (userReadAt) {
          unreadCount = await prisma.generatedDocument.count({
            where: {
              entityType: E_MESSAGE,
              entityId: conv.id,
              createdAt: { gt: userReadAt },
            },
          });
        } else {
          unreadCount = await prisma.generatedDocument.count({
            where: { entityType: E_MESSAGE, entityId: conv.id },
          });
        }

        return {
          ...conv,
          lastMessage: lastMsg ? { id: lastMsg.id, ...parseData(lastMsg), createdAt: lastMsg.createdAt } : null,
          unreadCount,
        };
      }),
    );

    // Sort by last message time
    enriched.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    res.json(ok(enriched));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch conversations"));
  }
});

// POST /messages/conversations — Create conversation
router.post("/conversations", async (req: Request, res: Response) => {
  try {
    const { name, type, members, userId } = req.body;
    if (!userId || !members || !Array.isArray(members)) {
      return res.status(400).json(fail("userId and members[] are required"));
    }

    // Ensure creator is in members
    const allMembers = Array.from(new Set([userId, ...members]));

    // For direct conversations, check if already exists
    if (type === "direct" && allMembers.length === 2) {
      const existing = await prisma.generatedDocument.findMany({
        where: { entityType: E_CONVERSATION },
      });
      const existingDirect = existing.find((c) => {
        const cd = parseData(c);
        return (
          cd.type === "direct" &&
          cd.members?.length === 2 &&
          cd.members.includes(allMembers[0]) &&
          cd.members.includes(allMembers[1])
        );
      });
      if (existingDirect) {
        return res.json(ok({ id: existingDirect.id, name: existingDirect.name, ...parseData(existingDirect) }, "Existing conversation found"));
      }
    }

    const conversationName = name || (type === "direct" ? "Direct Message" : `Group (${allMembers.length})`);

    const conversation = await prisma.generatedDocument.create({
      data: {
        entityType: E_CONVERSATION,
        name: conversationName,
        category: "MESSAGING",
        format: "JSON",
        generatedBy: userId,
        data: {
          type: type || "group",
          members: allMembers,
          adminIds: [userId],
          pinned: false,
          archived: false,
          createdBy: userId,
        },
      },
    });

    res.status(201).json(ok({
      id: conversation.id,
      name: conversation.name,
      ...parseData(conversation),
      createdAt: conversation.createdAt,
    }, "Conversation created"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to create conversation"));
  }
});

// GET /messages/conversations/:id — Conversation detail with messages
router.get("/conversations/:id", async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!conversation || conversation.entityType !== E_CONVERSATION) {
      return res.status(404).json(fail("Conversation not found"));
    }

    const page = parseInt(String(req.query.page || "1"), 10);
    const limit = parseInt(String(req.query.limit || "50"), 10);
    const skip = (page - 1) * limit;

    const [messages, totalMessages] = await Promise.all([
      prisma.generatedDocument.findMany({
        where: { entityType: E_MESSAGE, entityId: req.params.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.generatedDocument.count({
        where: { entityType: E_MESSAGE, entityId: req.params.id },
      }),
    ]);

    // Include reactions for each message
    const enrichedMessages = await Promise.all(
      messages.map(async (m) => {
        const reactions = await prisma.generatedDocument.findMany({
          where: { entityType: E_REACTION, entityId: m.id },
        });
        const reactionMap: Record<string, string[]> = {};
        for (const r of reactions) {
          const rd = parseData(r);
          if (rd.emoji) {
            if (!reactionMap[rd.emoji]) reactionMap[rd.emoji] = [];
            reactionMap[rd.emoji].push(rd.userId);
          }
        }
        return {
          id: m.id,
          ...parseData(m),
          reactions: reactionMap,
          createdAt: m.createdAt,
        };
      }),
    );

    // Return in chronological order
    enrichedMessages.reverse();

    res.json(ok({
      id: conversation.id,
      name: conversation.name,
      ...parseData(conversation),
      messages: enrichedMessages,
      createdAt: conversation.createdAt,
    }, undefined, {
      total: totalMessages,
      page,
      limit,
      totalPages: Math.ceil(totalMessages / limit),
    }));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch conversation"));
  }
});

// PUT /messages/conversations/:id — Update conversation
router.put("/conversations/:id", async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!conversation || conversation.entityType !== E_CONVERSATION) {
      return res.status(404).json(fail("Conversation not found"));
    }

    const { name, addMembers, removeMembers } = req.body;
    const existing = parseData(conversation);
    let members: string[] = existing.members || [];

    if (addMembers && Array.isArray(addMembers)) {
      members = Array.from(new Set([...members, ...addMembers]));
    }
    if (removeMembers && Array.isArray(removeMembers)) {
      members = members.filter((m: string) => !removeMembers.includes(m));
    }

    const updated = await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: {
        name: name || conversation.name,
        data: { ...existing, members },
      },
    });

    res.json(ok({ id: updated.id, name: updated.name, ...parseData(updated) }, "Conversation updated"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to update conversation"));
  }
});

// ══════════════════════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════════════════════

// POST /messages/conversations/:id/messages — Send message
router.post("/conversations/:id/messages", async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!conversation || conversation.entityType !== E_CONVERSATION) {
      return res.status(404).json(fail("Conversation not found"));
    }

    const { content, userId, attachments } = req.body;
    if (!content || !userId) {
      return res.status(400).json(fail("content and userId are required"));
    }

    // Verify user is a member
    const convData = parseData(conversation);
    if (!convData.members?.includes(userId)) {
      return res.status(403).json(fail("Not a member of this conversation"));
    }

    const message = await prisma.generatedDocument.create({
      data: {
        entityType: E_MESSAGE,
        entityId: req.params.id,
        name: `Message by ${userId}`,
        category: "MESSAGING",
        format: "JSON",
        generatedBy: userId,
        data: {
          content,
          senderId: userId,
          attachments: attachments || [],
          edited: false,
          deleted: false,
        },
      },
    });

    // Create notification for other members
    const otherMembers = (convData.members || []).filter((m: string) => m !== userId);
    const preview = content.length > 100 ? content.substring(0, 100) + "..." : content;

    for (const memberId of otherMembers) {
      await prisma.notification.create({
        data: {
          userId: memberId,
          title: `New message in ${conversation.name}`,
          message: preview,
          type: "info",
          module: "messaging",
          actionUrl: `/messages?conversation=${req.params.id}`,
        },
      });
    }

    // Mark sender as read
    if (!readReceipts.has(req.params.id)) {
      readReceipts.set(req.params.id, new Map());
    }
    readReceipts.get(req.params.id)!.set(userId, new Date());

    // Clear typing indicator
    typingIndicators.get(req.params.id)?.delete(userId);

    res.status(201).json(ok({
      id: message.id,
      ...parseData(message),
      reactions: {},
      createdAt: message.createdAt,
    }, "Message sent"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to send message"));
  }
});

// PUT /messages/messages/:id — Edit message
router.put("/messages/:id", async (req: Request, res: Response) => {
  try {
    const message = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!message || message.entityType !== E_MESSAGE) {
      return res.status(404).json(fail("Message not found"));
    }

    const { content, userId } = req.body;
    const existing = parseData(message);

    if (existing.senderId !== userId) {
      return res.status(403).json(fail("Can only edit own messages"));
    }

    if (!content) {
      return res.status(400).json(fail("content is required"));
    }

    const updated = await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: {
        data: { ...existing, content, edited: true, editedAt: new Date().toISOString() },
      },
    });

    res.json(ok({ id: updated.id, ...parseData(updated), createdAt: updated.createdAt }, "Message edited"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to edit message"));
  }
});

// DELETE /messages/messages/:id — Delete message (soft delete)
router.delete("/messages/:id", async (req: Request, res: Response) => {
  try {
    const message = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!message || message.entityType !== E_MESSAGE) {
      return res.status(404).json(fail("Message not found"));
    }

    const existing = parseData(message);

    const updated = await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: {
        data: { ...existing, deleted: true, content: "[Message deleted]", deletedAt: new Date().toISOString() },
      },
    });

    res.json(ok({ id: updated.id }, "Message deleted"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to delete message"));
  }
});

// POST /messages/messages/:id/reactions — Add reaction
router.post("/messages/:id/reactions", async (req: Request, res: Response) => {
  try {
    const message = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!message || message.entityType !== E_MESSAGE) {
      return res.status(404).json(fail("Message not found"));
    }

    const { emoji, userId } = req.body;
    if (!emoji || !userId) {
      return res.status(400).json(fail("emoji and userId are required"));
    }

    // Check for existing reaction from this user with this emoji
    const existing = await prisma.generatedDocument.findFirst({
      where: { entityType: E_REACTION, entityId: req.params.id },
    });

    // Check if this user already reacted with this emoji
    const allReactions = await prisma.generatedDocument.findMany({
      where: { entityType: E_REACTION, entityId: req.params.id },
    });
    const duplicate = allReactions.find((r) => {
      const rd = parseData(r);
      return rd.emoji === emoji && rd.userId === userId;
    });

    if (duplicate) {
      return res.status(400).json(fail("Already reacted with this emoji"));
    }

    const reaction = await prisma.generatedDocument.create({
      data: {
        entityType: E_REACTION,
        entityId: req.params.id,
        name: `Reaction: ${emoji}`,
        category: "MESSAGING",
        format: "JSON",
        generatedBy: userId,
        data: { emoji, userId },
      },
    });

    res.status(201).json(ok({ id: reaction.id, emoji, userId }, "Reaction added"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to add reaction"));
  }
});

// DELETE /messages/messages/:id/reactions/:emoji — Remove reaction
router.delete("/messages/:id/reactions/:emoji", async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json(fail("userId query parameter is required"));
    }

    const reactions = await prisma.generatedDocument.findMany({
      where: { entityType: E_REACTION, entityId: req.params.id },
    });

    const reaction = reactions.find((r) => {
      const rd = parseData(r);
      return rd.emoji === req.params.emoji && rd.userId === String(userId);
    });

    if (!reaction) {
      return res.status(404).json(fail("Reaction not found"));
    }

    await prisma.generatedDocument.delete({ where: { id: reaction.id } });

    res.json(ok(null, "Reaction removed"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to remove reaction"));
  }
});

// ══════════════════════════════════════════════════════════════
// READ / UNREAD / ARCHIVE / PIN
// ══════════════════════════════════════════════════════════════

// GET /messages/unread — Unread count per conversation
router.get("/unread", async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json(fail("userId query parameter is required"));
    }

    const conversations = await prisma.generatedDocument.findMany({
      where: { entityType: E_CONVERSATION },
    });

    const userConversations = conversations.filter((c) => {
      const cd = parseData(c);
      return cd.members?.includes(String(userId));
    });

    let totalUnread = 0;
    const perConversation: Array<{ conversationId: string; name: string; unread: number }> = [];

    for (const conv of userConversations) {
      const userReadAt = readReceipts.get(conv.id)?.get(String(userId));
      let unread: number;
      if (userReadAt) {
        unread = await prisma.generatedDocument.count({
          where: {
            entityType: E_MESSAGE,
            entityId: conv.id,
            createdAt: { gt: userReadAt },
          },
        });
      } else {
        unread = await prisma.generatedDocument.count({
          where: { entityType: E_MESSAGE, entityId: conv.id },
        });
      }

      totalUnread += unread;
      if (unread > 0) {
        perConversation.push({ conversationId: conv.id, name: conv.name, unread });
      }
    }

    res.json(ok({ totalUnread, perConversation }));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch unread counts"));
  }
});

// POST /messages/conversations/:id/read — Mark conversation as read
router.post("/conversations/:id/read", async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json(fail("userId is required"));
    }

    if (!readReceipts.has(req.params.id)) {
      readReceipts.set(req.params.id, new Map());
    }
    readReceipts.get(req.params.id)!.set(userId, new Date());

    res.json(ok({ conversationId: req.params.id, readAt: new Date() }, "Marked as read"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to mark as read"));
  }
});

// POST /messages/conversations/:id/archive — Archive conversation
router.post("/conversations/:id/archive", async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!conversation || conversation.entityType !== E_CONVERSATION) {
      return res.status(404).json(fail("Conversation not found"));
    }

    const existing = parseData(conversation);
    await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: { data: { ...existing, archived: true, archivedAt: new Date().toISOString() } },
    });

    res.json(ok({ id: req.params.id }, "Conversation archived"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to archive conversation"));
  }
});

// POST /messages/conversations/:id/unarchive — Unarchive
router.post("/conversations/:id/unarchive", async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!conversation || conversation.entityType !== E_CONVERSATION) {
      return res.status(404).json(fail("Conversation not found"));
    }

    const existing = parseData(conversation);
    await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: { data: { ...existing, archived: false } },
    });

    res.json(ok({ id: req.params.id }, "Conversation unarchived"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to unarchive conversation"));
  }
});

// POST /messages/conversations/:id/pin — Pin conversation
router.post("/conversations/:id/pin", async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!conversation || conversation.entityType !== E_CONVERSATION) {
      return res.status(404).json(fail("Conversation not found"));
    }

    const existing = parseData(conversation);
    const pinned = !existing.pinned;
    await prisma.generatedDocument.update({
      where: { id: req.params.id },
      data: { data: { ...existing, pinned } },
    });

    res.json(ok({ id: req.params.id, pinned }, pinned ? "Conversation pinned" : "Conversation unpinned"));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to pin conversation"));
  }
});

// GET /messages/search — Full text search across messages
router.get("/search", async (req: Request, res: Response) => {
  try {
    const { query, userId, page = "1", limit = "20" } = req.query;
    if (!query || !userId) {
      return res.status(400).json(fail("query and userId are required"));
    }

    const term = String(query).toLowerCase();
    const skip = (parseInt(String(page), 10) - 1) * parseInt(String(limit), 10);
    const take = parseInt(String(limit), 10);

    // Get user's conversations
    const conversations = await prisma.generatedDocument.findMany({
      where: { entityType: E_CONVERSATION },
    });
    const userConvIds = conversations
      .filter((c) => parseData(c).members?.includes(String(userId)))
      .map((c) => c.id);

    if (userConvIds.length === 0) {
      return res.json(ok([], undefined, { total: 0, page: 1, limit: take, totalPages: 0 }));
    }

    // Search messages
    const allMessages = await prisma.generatedDocument.findMany({
      where: { entityType: E_MESSAGE, entityId: { in: userConvIds } },
      orderBy: { createdAt: "desc" },
    });

    const matched = allMessages.filter((m) => {
      const md = parseData(m);
      return !md.deleted && (md.content || "").toLowerCase().includes(term);
    });

    const total = matched.length;
    const paginated = matched.slice(skip, skip + take).map((m) => ({
      id: m.id,
      conversationId: m.entityId,
      ...parseData(m),
      createdAt: m.createdAt,
    }));

    res.json(ok(paginated, undefined, {
      total,
      page: parseInt(String(page), 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    }));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to search messages"));
  }
});

// GET /messages/conversations/:id/members — List members
router.get("/conversations/:id/members", async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!conversation || conversation.entityType !== E_CONVERSATION) {
      return res.status(404).json(fail("Conversation not found"));
    }

    const convData = parseData(conversation);
    const memberIds: string[] = convData.members || [];

    // Fetch user details for each member
    const members = await Promise.all(
      memberIds.map(async (uid) => {
        const user = await prisma.user.findUnique({
          where: { id: uid },
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true, role: true },
        });
        return user || { id: uid, firstName: "Unknown", lastName: "User", email: "" };
      }),
    );

    res.json(ok(members));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch members"));
  }
});

// POST /messages/conversations/:id/typing — Typing indicator
router.post("/conversations/:id/typing", async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json(fail("userId is required"));
    }

    if (!typingIndicators.has(req.params.id)) {
      typingIndicators.set(req.params.id, new Map());
    }

    // Set typing indicator with 5-second expiry
    typingIndicators.get(req.params.id)!.set(userId, Date.now() + 5000);

    // Clean expired indicators
    const convTyping = typingIndicators.get(req.params.id)!;
    const now = Date.now();
    const activeTypers: string[] = [];
    for (const [uid, expiresAt] of convTyping.entries()) {
      if (expiresAt > now) {
        activeTypers.push(uid);
      } else {
        convTyping.delete(uid);
      }
    }

    res.json(ok({ conversationId: req.params.id, typing: activeTypers }));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to update typing indicator"));
  }
});

// GET /messages/dashboard — Messaging stats
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const [totalConversations, totalMessages] = await Promise.all([
      prisma.generatedDocument.count({ where: { entityType: E_CONVERSATION } }),
      prisma.generatedDocument.count({ where: { entityType: E_MESSAGE } }),
    ]);

    // Messages in last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentMessages = await prisma.generatedDocument.count({
      where: { entityType: E_MESSAGE, createdAt: { gte: oneDayAgo } },
    });

    // Messages in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekMessages = await prisma.generatedDocument.count({
      where: { entityType: E_MESSAGE, createdAt: { gte: sevenDaysAgo } },
    });

    // Active conversations (had messages in last 7 days)
    const recentConvMessages = await prisma.generatedDocument.findMany({
      where: { entityType: E_MESSAGE, createdAt: { gte: sevenDaysAgo } },
      select: { entityId: true },
    });
    const activeConvIds = new Set(recentConvMessages.map((m) => m.entityId));

    res.json(ok({
      totalConversations,
      totalMessages,
      messagesLast24h: recentMessages,
      messagesLast7d: weekMessages,
      activeConversations: activeConvIds.size,
    }));
  } catch (error: any) {
    res.status(500).json(fail(error.message || "Failed to fetch messaging dashboard"));
  }
});

export { router as messagingRouter };

// ──────────────────────────────────────────────────────────────
// HR Payroll — Conversation Service
// Messaging: direct/group conversations, messages, reactions,
// read receipts, search, pinning, archiving, file sharing.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface Conversation {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  memberIds: string[];
  createdAt: string;
  createdBy: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
  reactions: Reaction[];
  replyTo: string | null;
  editedAt: string | null;
  deleted: boolean;
  attachments: Attachment[];
  createdAt: string;
}

interface Reaction {
  userId: string;
  emoji: string;
  createdAt: string;
}

interface Attachment {
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

interface ConversationMember {
  userId: string;
  joinedAt: string;
  lastReadAt: string | null;
  pinned: boolean;
  archived: boolean;
  online: boolean;
}

interface UnreadCount {
  conversationId: string;
  conversationName: string | null;
  unread: number;
}

// ══════════════════════════════════════════════════════════════
// Helper
// ══════════════════════════════════════════════════════════════

function generateId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ══════════════════════════════════════════════════════════════
// ConversationService
// ══════════════════════════════════════════════════════════════

export class ConversationService {
  // ── Conversation CRUD ─────────────────────────────────────

  async createDirectConversation(userId1: string, userId2: string): Promise<Conversation> {
    // Check if direct conversation already exists
    const existing = await prisma.generatedDocument.findMany({
      where: { category: "CONVERSATION" },
    });

    for (const doc of existing) {
      const data = doc.data as Record<string, any>;
      if (data.type !== "DIRECT") continue;
      const members = (data.memberIds ?? []) as string[];
      if (members.length === 2 && members.includes(userId1) && members.includes(userId2)) {
        return this.docToConversation(doc);
      }
    }

    const members: ConversationMember[] = [userId1, userId2].map((uid) => ({
      userId: uid,
      joinedAt: new Date().toISOString(),
      lastReadAt: null,
      pinned: false,
      archived: false,
      online: false,
    }));

    const doc = await prisma.generatedDocument.create({
      data: {
        name: "Direct Message",
        category: "CONVERSATION",
        entityType: "CONVERSATION",
        generatedBy: userId1,
        format: "JSON",
        data: {
          type: "DIRECT",
          memberIds: [userId1, userId2],
          members,
          lastMessageAt: null,
          lastMessagePreview: null,
        } as any,
      },
    });

    return this.docToConversation(doc);
  }

  async createGroupConversation(name: string, memberIds: string[], createdBy: string): Promise<Conversation> {
    const uniqueIds = [...new Set([createdBy, ...memberIds])];

    const members: ConversationMember[] = uniqueIds.map((uid) => ({
      userId: uid,
      joinedAt: new Date().toISOString(),
      lastReadAt: null,
      pinned: false,
      archived: false,
      online: false,
    }));

    const doc = await prisma.generatedDocument.create({
      data: {
        name,
        category: "CONVERSATION",
        entityType: "CONVERSATION",
        generatedBy: createdBy,
        format: "JSON",
        data: {
          type: "GROUP",
          memberIds: uniqueIds,
          members,
          lastMessageAt: null,
          lastMessagePreview: null,
        } as any,
      },
    });

    return this.docToConversation(doc);
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: conversationId, category: "CONVERSATION" },
    });
    if (!doc) return null;
    return this.docToConversation(doc);
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
    const allConvos = await prisma.generatedDocument.findMany({
      where: { category: "CONVERSATION" },
      orderBy: { createdAt: "desc" },
    });

    const userConvos: Conversation[] = [];
    for (const doc of allConvos) {
      const data = doc.data as Record<string, any>;
      const memberIds = (data.memberIds ?? []) as string[];
      const members = (data.members ?? []) as ConversationMember[];
      const member = members.find((m) => m.userId === userId);

      if (memberIds.includes(userId) && (!member || !member.archived)) {
        userConvos.push(this.docToConversation(doc));
      }
    }

    // Sort by last message date
    return userConvos.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  // ── Member Management ─────────────────────────────────────

  async addMember(conversationId: string, userId: string): Promise<boolean> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: conversationId, category: "CONVERSATION" },
    });
    if (!doc || !doc.data) return false;

    const data = doc.data as Record<string, any>;
    if (data.type === "DIRECT") return false; // Can't add to direct

    const memberIds = (data.memberIds ?? []) as string[];
    if (memberIds.includes(userId)) return true;

    memberIds.push(userId);
    data.memberIds = memberIds;

    const members = (data.members ?? []) as ConversationMember[];
    members.push({
      userId,
      joinedAt: new Date().toISOString(),
      lastReadAt: null,
      pinned: false,
      archived: false,
      online: false,
    });
    data.members = members;

    await prisma.generatedDocument.update({
      where: { id: conversationId },
      data: { data },
    });

    // System message
    await this.sendMessage(conversationId, "system", `User ${userId} was added to the conversation`, "SYSTEM");

    return true;
  }

  async removeMember(conversationId: string, userId: string): Promise<boolean> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: conversationId, category: "CONVERSATION" },
    });
    if (!doc || !doc.data) return false;

    const data = doc.data as Record<string, any>;
    if (data.type === "DIRECT") return false;

    const memberIds = (data.memberIds ?? []) as string[];
    const index = memberIds.indexOf(userId);
    if (index === -1) return false;

    memberIds.splice(index, 1);
    data.memberIds = memberIds;

    const members = (data.members ?? []) as ConversationMember[];
    data.members = members.filter((m) => m.userId !== userId);

    await prisma.generatedDocument.update({
      where: { id: conversationId },
      data: { data },
    });

    await this.sendMessage(conversationId, "system", `User ${userId} was removed from the conversation`, "SYSTEM");

    return true;
  }

  // ── Messages ──────────────────────────────────────────────

  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: "TEXT" | "IMAGE" | "FILE" | "SYSTEM" = "TEXT",
    attachments: Attachment[] = [],
    replyTo: string | null = null,
  ): Promise<Message> {
    const messageId = generateId();

    const message: Message = {
      id: messageId,
      conversationId,
      senderId,
      content,
      type,
      reactions: [],
      replyTo,
      editedAt: null,
      deleted: false,
      attachments,
      createdAt: new Date().toISOString(),
    };

    await prisma.generatedDocument.create({
      data: {
        id: messageId,
        name: content.slice(0, 100),
        category: "MESSAGE",
        entityType: "MESSAGE",
        entityId: conversationId,
        generatedBy: senderId,
        format: "JSON",
        data: message as any,
      },
    });

    // Update conversation last message
    const convoDoc = await prisma.generatedDocument.findFirst({
      where: { id: conversationId, category: "CONVERSATION" },
    });
    if (convoDoc?.data) {
      const convoData = convoDoc.data as Record<string, any>;
      convoData.lastMessageAt = message.createdAt;
      convoData.lastMessagePreview = content.slice(0, 50);
      await prisma.generatedDocument.update({
        where: { id: conversationId },
        data: { data: convoData },
      });
    }

    return message;
  }

  async editMessage(messageId: string, newContent: string): Promise<Message | null> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: messageId, category: "MESSAGE" },
    });
    if (!doc || !doc.data) return null;

    const data = doc.data as Record<string, any>;
    if (data.deleted) return null;

    data.content = newContent;
    data.editedAt = new Date().toISOString();

    await prisma.generatedDocument.update({
      where: { id: messageId },
      data: {
        name: newContent.slice(0, 100),
        data,
      },
    });

    return data as Message;
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: messageId, category: "MESSAGE" },
    });
    if (!doc || !doc.data) return false;

    const data = doc.data as Record<string, any>;
    data.deleted = true;
    data.content = "This message was deleted";

    await prisma.generatedDocument.update({
      where: { id: messageId },
      data: { data },
    });

    return true;
  }

  // ── Reactions ─────────────────────────────────────────────

  async addReaction(messageId: string, userId: string, emoji: string): Promise<boolean> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: messageId, category: "MESSAGE" },
    });
    if (!doc || !doc.data) return false;

    const data = doc.data as Record<string, any>;
    const reactions = (data.reactions ?? []) as Reaction[];

    // Check if user already reacted with this emoji
    const existingIndex = reactions.findIndex((r) => r.userId === userId && r.emoji === emoji);
    if (existingIndex >= 0) return true;

    reactions.push({
      userId,
      emoji,
      createdAt: new Date().toISOString(),
    });
    data.reactions = reactions;

    await prisma.generatedDocument.update({
      where: { id: messageId },
      data: { data },
    });

    return true;
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<boolean> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: messageId, category: "MESSAGE" },
    });
    if (!doc || !doc.data) return false;

    const data = doc.data as Record<string, any>;
    const reactions = (data.reactions ?? []) as Reaction[];
    const index = reactions.findIndex((r) => r.userId === userId && r.emoji === emoji);
    if (index === -1) return false;

    reactions.splice(index, 1);
    data.reactions = reactions;

    await prisma.generatedDocument.update({
      where: { id: messageId },
      data: { data },
    });

    return true;
  }

  // ── Read Receipts ─────────────────────────────────────────

  async markAsRead(conversationId: string, userId: string): Promise<boolean> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: conversationId, category: "CONVERSATION" },
    });
    if (!doc || !doc.data) return false;

    const data = doc.data as Record<string, any>;
    const members = (data.members ?? []) as ConversationMember[];
    const member = members.find((m) => m.userId === userId);
    if (!member) return false;

    member.lastReadAt = new Date().toISOString();
    data.members = members;

    await prisma.generatedDocument.update({
      where: { id: conversationId },
      data: { data },
    });

    return true;
  }

  async getUnreadCounts(userId: string): Promise<UnreadCount[]> {
    const conversations = await this.getUserConversations(userId);
    const counts: UnreadCount[] = [];

    for (const convo of conversations) {
      const convoDoc = await prisma.generatedDocument.findFirst({
        where: { id: convo.id, category: "CONVERSATION" },
      });
      if (!convoDoc?.data) continue;

      const convoData = convoDoc.data as Record<string, any>;
      const members = (convoData.members ?? []) as ConversationMember[];
      const member = members.find((m) => m.userId === userId);
      const lastReadAt = member?.lastReadAt ? new Date(member.lastReadAt) : new Date(0);

      const messages = await prisma.generatedDocument.findMany({
        where: {
          category: "MESSAGE",
          entityId: convo.id,
          createdAt: { gt: lastReadAt },
        },
      });

      // Exclude user's own messages
      const unread = messages.filter((m) => m.generatedBy !== userId).length;

      if (unread > 0) {
        counts.push({
          conversationId: convo.id,
          conversationName: convo.name,
          unread,
        });
      }
    }

    return counts;
  }

  // ── Search ────────────────────────────────────────────────

  async searchMessages(userId: string, query: string): Promise<Message[]> {
    const conversations = await this.getUserConversations(userId);
    const convoIds = conversations.map((c) => c.id);

    const allMessages = await prisma.generatedDocument.findMany({
      where: {
        category: "MESSAGE",
        entityId: { in: convoIds },
      },
      orderBy: { createdAt: "desc" },
    });

    const lowerQuery = query.toLowerCase();
    return allMessages
      .filter((m) => {
        const data = m.data as Record<string, any>;
        return !data.deleted && (data.content ?? "").toLowerCase().includes(lowerQuery);
      })
      .map((m) => m.data as unknown as Message);
  }

  // ── Pin / Archive ─────────────────────────────────────────

  async pinConversation(conversationId: string, userId: string): Promise<boolean> {
    return this.setMemberFlag(conversationId, userId, "pinned", true);
  }

  async unpinConversation(conversationId: string, userId: string): Promise<boolean> {
    return this.setMemberFlag(conversationId, userId, "pinned", false);
  }

  async archiveConversation(conversationId: string, userId: string): Promise<boolean> {
    return this.setMemberFlag(conversationId, userId, "archived", true);
  }

  private async setMemberFlag(
    conversationId: string,
    userId: string,
    flag: "pinned" | "archived",
    value: boolean,
  ): Promise<boolean> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: conversationId, category: "CONVERSATION" },
    });
    if (!doc || !doc.data) return false;

    const data = doc.data as Record<string, any>;
    const members = (data.members ?? []) as ConversationMember[];
    const member = members.find((m) => m.userId === userId);
    if (!member) return false;

    member[flag] = value;
    data.members = members;

    await prisma.generatedDocument.update({
      where: { id: conversationId },
      data: { data },
    });

    return true;
  }

  // ── Conversation Members ──────────────────────────────────

  async getConversationMembers(conversationId: string): Promise<ConversationMember[]> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { id: conversationId, category: "CONVERSATION" },
    });
    if (!doc || !doc.data) return [];

    const data = doc.data as Record<string, any>;
    return (data.members ?? []) as ConversationMember[];
  }

  // ── Shared Files ──────────────────────────────────────────

  async getSharedFiles(conversationId: string): Promise<Message[]> {
    const messages = await prisma.generatedDocument.findMany({
      where: {
        category: "MESSAGE",
        entityId: conversationId,
      },
      orderBy: { createdAt: "desc" },
    });

    return messages
      .filter((m) => {
        const data = m.data as Record<string, any>;
        return !data.deleted && ((data.attachments ?? []).length > 0 || data.type === "FILE" || data.type === "IMAGE");
      })
      .map((m) => m.data as unknown as Message);
  }

  // ── Forward Message ───────────────────────────────────────

  async forwardMessage(messageId: string, toConversationId: string, userId: string): Promise<Message | null> {
    const original = await prisma.generatedDocument.findFirst({
      where: { id: messageId, category: "MESSAGE" },
    });
    if (!original || !original.data) return null;

    const originalData = original.data as Record<string, any>;
    if (originalData.deleted) return null;

    const forwardedContent = `[Forwarded] ${originalData.content ?? ""}`;
    return this.sendMessage(
      toConversationId,
      userId,
      forwardedContent,
      originalData.type ?? "TEXT",
      originalData.attachments ?? [],
    );
  }

  // ── Recent Contacts ───────────────────────────────────────

  async getRecentContacts(userId: string): Promise<string[]> {
    const messages = await prisma.generatedDocument.findMany({
      where: {
        category: "MESSAGE",
        generatedBy: userId,
      },
      orderBy: { createdAt: "desc" },
    });

    const contactSet = new Set<string>();
    const contacts: string[] = [];

    for (const msg of messages) {
      const data = msg.data as Record<string, any>;
      const convoId = data.conversationId ?? msg.entityId;
      if (!convoId) continue;

      const convo = await prisma.generatedDocument.findFirst({
        where: { id: convoId, category: "CONVERSATION" },
      });
      if (!convo?.data) continue;

      const convoData = convo.data as Record<string, any>;
      const memberIds = (convoData.memberIds ?? []) as string[];

      for (const memberId of memberIds) {
        if (memberId !== userId && !contactSet.has(memberId)) {
          contactSet.add(memberId);
          contacts.push(memberId);
          if (contacts.length >= 10) return contacts;
        }
      }
    }

    return contacts;
  }

  // ── Get Conversation Messages ─────────────────────────────

  async getMessages(
    conversationId: string,
    limit: number = 50,
    before?: string,
  ): Promise<Message[]> {
    const whereClause: any = {
      category: "MESSAGE",
      entityId: conversationId,
    };

    if (before) {
      whereClause.createdAt = { lt: new Date(before) };
    }

    const docs = await prisma.generatedDocument.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return docs
      .map((d) => d.data as unknown as Message)
      .filter((m) => m !== null)
      .reverse();
  }

  // ── Helper: doc to Conversation ───────────────────────────

  private docToConversation(doc: any): Conversation {
    const data = (doc.data ?? {}) as Record<string, any>;
    return {
      id: doc.id,
      type: data.type ?? "DIRECT",
      name: doc.name !== "Direct Message" ? doc.name : null,
      memberIds: (data.memberIds ?? []) as string[],
      createdAt: doc.createdAt.toISOString(),
      createdBy: doc.generatedBy,
      lastMessageAt: data.lastMessageAt ?? null,
      lastMessagePreview: data.lastMessagePreview ?? null,
    };
  }
}

export const conversationService = new ConversationService();

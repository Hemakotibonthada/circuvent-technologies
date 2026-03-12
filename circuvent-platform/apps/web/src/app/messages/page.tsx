"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, Badge, Button,
  Modal, Input, Textarea, EmptyState,
} from "@/components/ui";
import { timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── Types ──────────────────────────────────────────────── */

interface Message {
  id: string;
  content: string;
  senderId: string;
  edited: boolean;
  deleted: boolean;
  reactions: Record<string, string[]>;
  createdAt: string;
}

interface Conversation {
  id: string;
  name: string;
  type: string;
  members: string[];
  pinned: boolean;
  archived: boolean;
  unreadCount: number;
  lastMessage: Message | null;
  createdAt: string;
}

interface UnreadData {
  totalUnread: number;
  perConversation: Array<{ conversationId: string; name: string; unread: number }>;
}

/* ── Component ──────────────────────────────────────────── */

export default function MessagesPage() {
  const { token, user } = useAuth();
  const { data: conversations, loading, refetch } = useApi<Conversation[]>(
    user?.id ? `/hr/messages/conversations?userId=${user?.id}` : null,
  );
  const { data: unreadData } = useApi<UnreadData>(
    user?.id ? `/hr/messages/unread?userId=${user?.id}` : null,
  );

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* Create conversation form */
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("group");
  const [newMembers, setNewMembers] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ── Load messages for selected conversation ───────────── */

  useEffect(() => {
    if (!selectedConvId || !token) return;
    loadMessages(selectedConvId);
    api.post(`/hr/messages/conversations/${selectedConvId}/read`, { userId: user?.id }, token);
  }, [selectedConvId, token, user?.id]);

  const loadMessages = async (convId: string) => {
    const res = await api.get<any>(`/hr/messages/conversations/${convId}`, token || undefined);
    if (res.success && res.data?.messages) {
      setMessages(res.data.messages);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Filtered conversations ────────────────────────────── */

  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    if (!searchQuery) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.lastMessage?.content?.toLowerCase().includes(q),
    );
  }, [conversations, searchQuery]);

  const sortedConversations = useMemo(() => {
    return [...filteredConversations].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
  }, [filteredConversations]);

  /* ── Handlers ──────────────────────────────────────────── */

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConvId) return;
    setSubmitting(true);
    const res = await api.post<any>(`/hr/messages/conversations/${selectedConvId}/messages`, {
      content: messageInput,
      userId: user?.id,
    }, token || undefined);
    if (res.success) {
      setMessageInput("");
      await loadMessages(selectedConvId);
    }
    setSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCreateConversation = async () => {
    if (!newMembers) return;
    setSubmitting(true);
    const memberIds = newMembers.split(",").map((s) => s.trim()).filter(Boolean);
    const res = await api.post<any>("/hr/messages/conversations", {
      name: newName || undefined,
      type: newType,
      members: memberIds,
      userId: user?.id,
    }, token || undefined);
    if (res.success && res.data?.id) {
      setSelectedConvId(res.data.id);
    }
    setShowCreateModal(false);
    setNewName(""); setNewMembers(""); setNewType("group");
    setSubmitting(false);
    refetch();
  };

  const handlePin = async (convId: string) => {
    await api.post(`/hr/messages/conversations/${convId}/pin`, {}, token || undefined);
    refetch();
  };

  const handleArchive = async (convId: string) => {
    await api.post(`/hr/messages/conversations/${convId}/archive`, {}, token || undefined);
    refetch();
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    await api.post(`/hr/messages/messages/${messageId}/reactions`, {
      emoji,
      userId: user?.id,
    }, token || undefined);
    if (selectedConvId) await loadMessages(selectedConvId);
  };

  const getUnread = (convId: string): number => {
    if (!unreadData) return 0;
    const entry = unreadData.perConversation.find((c) => c.conversationId === convId);
    return entry?.unread || 0;
  };

  const selectedConversation = conversations?.find((c) => c.id === selectedConvId);

  /* ── Render ────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        subtitle="Internal communications and team messaging"
      />

      {/* Unread indicator */}
      {unreadData && unreadData.totalUnread > 0 && (
        <div className="bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
            {unreadData.totalUnread} unread message{unreadData.totalUnread !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 260px)" }}>
        {/* Left panel: Conversation list */}
        <div className="col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden">
          {/* Search & Create */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button onClick={() => setShowCreateModal(true)}>+</Button>
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-slate-400 dark:text-slate-500">Loading…</div>
            ) : sortedConversations.length === 0 ? (
              <div className="p-4 text-center text-slate-400 dark:text-slate-500 text-sm">No conversations yet</div>
            ) : (
              sortedConversations.map((conv) => {
                const unread = getUnread(conv.id);
                const isSelected = conv.id === selectedConvId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-left p-3 border-b border-slate-100 dark:border-slate-800 transition-colors ${
                      isSelected
                        ? "bg-brand-50 dark:bg-brand-900/30 border-l-2 border-l-brand-500"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {conv.pinned && <span className="text-xs">📌</span>}
                          <span className={`text-sm font-medium truncate ${isSelected ? "text-brand-700 dark:text-brand-300" : "text-slate-900 dark:text-white"}`}>
                            {conv.name}
                          </span>
                        </div>
                        {conv.lastMessage && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                            {conv.lastMessage.content}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 ml-2">
                        {conv.lastMessage && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {timeAgo(conv.lastMessage.createdAt)}
                          </span>
                        )}
                        {unread > 0 && (
                          <span className="bg-brand-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge color={conv.type === "direct" ? "blue" : "purple"}>
                        {conv.type === "direct" ? "DM" : `${conv.members?.length || 0} members`}
                      </Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right panel: Messages */}
        <div className="col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden">
          {selectedConvId && selectedConversation ? (
            <>
              {/* Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{selectedConversation.name}</h3>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {selectedConversation.members?.length || 0} members
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePin(selectedConvId)}
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors"
                    title="Pin"
                  >
                    📌
                  </button>
                  <button
                    onClick={() => handleArchive(selectedConvId)}
                    className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors"
                    title="Archive"
                  >
                    📦
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center text-slate-400 dark:text-slate-500 text-sm py-8">No messages yet. Start the conversation!</div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.senderId === user?.id;
                    return (
                      <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[70%] ${isMine ? "order-last" : ""}`}>
                          {/* Sender name */}
                          {!isMine && (
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5 block">
                              {msg.senderId}
                            </span>
                          )}
                          {/* Message bubble */}
                          <div
                            className={`rounded-2xl px-4 py-2.5 ${
                              isMine
                                ? "bg-brand-500 text-white rounded-br-md"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-md"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            {msg.edited && (
                              <span className={`text-[10px] ${isMine ? "text-brand-200" : "text-slate-400 dark:text-slate-500"}`}>(edited)</span>
                            )}
                          </div>
                          {/* Meta row */}
                          <div className={`flex items-center gap-2 mt-0.5 ${isMine ? "justify-end" : ""}`}>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">{timeAgo(msg.createdAt)}</span>
                            {/* Reactions */}
                            {Object.entries(msg.reactions || {}).map(([emoji, users]) => (
                              <button
                                key={emoji}
                                onClick={() => handleReaction(msg.id, emoji)}
                                className="text-xs bg-slate-100 dark:bg-slate-800 rounded-full px-1.5 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                              >
                                {emoji} {users.length}
                              </button>
                            ))}
                            {/* Quick react buttons */}
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {["👍", "❤️", "😂"].map((e) => (
                                <button key={e} onClick={() => handleReaction(msg.id, e)} className="text-xs hover:scale-125 transition-transform">{e}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Textarea
                      value={messageInput}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessageInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message… (Enter to send)"
                      rows={2}
                    />
                  </div>
                  <Button onClick={handleSendMessage} disabled={submitting || !messageInput.trim()}>
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                title="Select a conversation"
                description="Choose a conversation from the left panel or create a new one."
              />
            </div>
          )}
        </div>
      </div>

      {/* Create Conversation Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="New Conversation">
        <div className="space-y-4">
          <Input
            label="Name (optional for DM)"
            value={newName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
            placeholder="Team Chat"
          />
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="radio" name="type" value="direct" checked={newType === "direct"} onChange={() => setNewType("direct")} />
              Direct Message
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="radio" name="type" value="group" checked={newType === "group"} onChange={() => setNewType("group")} />
              Group
            </label>
          </div>
          <Input
            label="Members (comma-separated user IDs)"
            value={newMembers}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMembers(e.target.value)}
            placeholder="userId1, userId2"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreateConversation} disabled={submitting || !newMembers}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import Link from "next/link";

/* ── Types ──────────────────────────────────────────────── */

interface Conversation {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  memberIds: string[];
  createdAt: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
  reactions: Array<{ userId: string; emoji: string }>;
  editedAt: string | null;
  deleted: boolean;
  createdAt: string;
}

interface UnreadCount {
  conversationId: string;
  conversationName: string | null;
  unread: number;
}

/* ── Component ──────────────────────────────────────────── */

export default function MessagesPage() {
  const { token, user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<UnreadCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState("");
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [search, setSearch] = useState("");
  const [newConvoForm, setNewConvoForm] = useState({ name: "", memberIds: "" });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userId = user?.id ?? "current-user";

  const loadConversations = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const [convosRes, unreadRes] = await Promise.all([
      api.get<Conversation[]>("/hr/portal/messages/conversations", token),
      api.get<UnreadCount[]>("/hr/portal/messages/unread", token),
    ]);
    if (convosRes.success) setConversations(convosRes.data ?? []);
    if (unreadRes.success) setUnreadCounts(unreadRes.data ?? []);
    setLoading(false);
  }, [token]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const selectConversation = useCallback(async (convo: Conversation) => {
    if (!token) return;
    setSelectedConvo(convo);
    const res = await api.get<Message[]>(`/hr/portal/messages/conversations/${convo.id}/messages`, token);
    if (res.success) setMessages(res.data ?? []);
    await api.post(`/hr/portal/messages/conversations/${convo.id}/read`, {}, token);
    setUnreadCounts((prev) => prev.filter((u) => u.conversationId !== convo.id));
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [token]);

  const sendMessage = async () => {
    if (!token || !selectedConvo || !messageText.trim()) return;
    await api.post(`/hr/portal/messages/conversations/${selectedConvo.id}/messages`, {
      content: messageText.trim(),
      type: "TEXT",
    }, token);
    setMessageText("");
    selectConversation(selectedConvo);
  };

  const createConversation = async () => {
    if (!token) return;
    const memberIds = newConvoForm.memberIds.split(",").map((id) => id.trim()).filter(Boolean);
    if (memberIds.length === 0) return;

    if (memberIds.length === 1 && !newConvoForm.name) {
      await api.post("/hr/portal/messages/conversations/direct", { userId2: memberIds[0] }, token);
    } else {
      await api.post("/hr/portal/messages/conversations/group", {
        name: newConvoForm.name || "Group Chat",
        memberIds,
      }, token);
    }
    setNewConvoForm({ name: "", memberIds: "" });
    setShowNewConvo(false);
    loadConversations();
  };

  const addReaction = async (messageId: string, emoji: string) => {
    if (!token) return;
    await api.post(`/hr/portal/messages/${messageId}/reactions`, { emoji }, token);
    if (selectedConvo) selectConversation(selectedConvo);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getUnreadForConvo = (convoId: string): number => {
    return unreadCounts.find((u) => u.conversationId === convoId)?.unread ?? 0;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
    return date.toLocaleDateString();
  };

  const filteredConvos = search
    ? conversations.filter((c) =>
        (c.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        c.memberIds.some((id) => id.toLowerCase().includes(search.toLowerCase()))
      )
    : conversations;

  /* ── Render ──────────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="mb-4">
        <Link href="/portal" className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">← Back to Portal</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">💬 Messages</h1>
      </div>

      <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden" style={{ height: "calc(100vh - 160px)" }}>
        {/* Conversation List */}
        <div className="w-80 border-r border-slate-200 dark:border-slate-800 flex flex-col">
          {/* Search & New */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex gap-2">
              <input
                value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations..."
                className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              />
              <button onClick={() => setShowNewConvo(true)} className="px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm" title="New conversation">+</button>
            </div>
          </div>

          {/* Conversation Items */}
          <div className="flex-1 overflow-y-auto">
            {filteredConvos.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">No conversations</div>
            ) : (
              filteredConvos.map((convo) => {
                const unread = getUnreadForConvo(convo.id);
                const isSelected = selectedConvo?.id === convo.id;
                return (
                  <div
                    key={convo.id}
                    onClick={() => selectConversation(convo)}
                    className={`p-3 cursor-pointer border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 ${isSelected ? "bg-brand-50 dark:bg-brand-900/20 border-l-2 border-l-brand-600" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {convo.type === "GROUP" ? "👥" : "👤"} {convo.name ?? `Chat`}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {convo.lastMessageAt && (
                          <span className="text-[10px] text-slate-400">{formatTime(convo.lastMessageAt)}</span>
                        )}
                        {unread > 0 && (
                          <span className="bg-brand-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">{unread}</span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {convo.lastMessagePreview ?? "No messages yet"}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {!selectedConvo ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-4xl mb-3">💬</p>
                <p className="text-lg text-slate-500 dark:text-slate-400">Select a conversation</p>
                <p className="text-sm text-slate-400 dark:text-slate-500">or start a new one</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedConvo.type === "GROUP" ? "👥" : "👤"} {selectedConvo.name ?? "Direct Message"}
                  </h3>
                  <p className="text-[10px] text-slate-400">{selectedConvo.memberIds.length} members</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-sm text-slate-400">No messages yet. Say hello! 👋</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.senderId === userId;
                    const isSystem = msg.type === "SYSTEM";

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="text-center">
                          <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{msg.content}</span>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[70%] ${isOwn ? "order-last" : ""}`}>
                          <div className={`px-3 py-2 rounded-2xl ${isOwn
                            ? "bg-brand-600 text-white rounded-br-md"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-md"
                          }`}>
                            {!isOwn && (
                              <p className="text-[10px] font-medium mb-0.5 opacity-70">{msg.senderId}</p>
                            )}
                            <p className="text-sm whitespace-pre-wrap">{msg.deleted ? "This message was deleted" : msg.content}</p>
                            {msg.editedAt && <span className="text-[9px] opacity-50">(edited)</span>}
                          </div>

                          {/* Reactions */}
                          <div className="flex items-center gap-1 mt-0.5">
                            {msg.reactions.length > 0 && (
                              <div className="flex gap-0.5">
                                {[...new Set(msg.reactions.map((r) => r.emoji))].map((emoji) => (
                                  <span key={emoji} className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700"
                                    onClick={() => addReaction(msg.id, emoji)}>
                                    {emoji} {msg.reactions.filter((r) => r.emoji === emoji).length}
                                  </span>
                                ))}
                              </div>
                            )}
                            {!msg.deleted && (
                              <div className="flex gap-0.5 opacity-0 hover:opacity-100 transition-opacity">
                                {["👍", "❤️", "😂", "😮"].map((emoji) => (
                                  <button key={emoji} onClick={() => addReaction(msg.id, emoji)} className="text-xs hover:scale-125 transition-transform">{emoji}</button>
                                ))}
                              </div>
                            )}
                            <span className={`text-[9px] ${isOwn ? "text-slate-400" : "text-slate-300 dark:text-slate-600"}`}>
                              {formatTime(msg.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex gap-2">
                  <input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                  <button onClick={sendMessage} disabled={!messageText.trim()} className="px-4 py-2 bg-brand-600 text-white rounded-full hover:bg-brand-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New Conversation Modal */}
      {showNewConvo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">New Conversation</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Group Name (optional for DM)</label>
                <input value={newConvoForm.name} onChange={(e) => setNewConvoForm({ ...newConvoForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm" placeholder="Team Chat" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Member IDs (comma-separated)</label>
                <input value={newConvoForm.memberIds} onChange={(e) => setNewConvoForm({ ...newConvoForm, memberIds: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm" placeholder="user-1, user-2" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowNewConvo(false)} className="px-3 py-2 text-sm text-slate-600 dark:text-slate-400">Cancel</button>
              <button onClick={createConversation} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

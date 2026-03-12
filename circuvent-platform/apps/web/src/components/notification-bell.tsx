"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth, useApi } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import { timeAgo } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  module: string;
  isRead: boolean;
  actionUrl: string | null;
  createdAt: string;
}

const typeIcons: Record<string, string> = {
  info: "ℹ️",
  warning: "⚠️",
  error: "❌",
  success: "✅",
};

const typeColors: Record<string, string> = {
  info: "text-blue-400",
  warning: "text-amber-400",
  error: "text-red-400",
  success: "text-green-400",
};

export function NotificationBell() {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch unread count periodically
  useEffect(() => {
    const fetchUnreadCount = async () => {
      if (!token) return;
      const res = await api.get<{ count: number }>("/notifications/unread-count", token);
      if (res.success && res.data) {
        setUnreadCount(res.data.count);
      }
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [token]);

  // Fetch notifications when panel opens
  useEffect(() => {
    if (isOpen && token) {
      setLoading(true);
      api.get<Notification[]>("/notifications?limit=20", token).then((res) => {
        if (res.success && res.data) {
          setNotifications(Array.isArray(res.data) ? res.data : []);
        }
        setLoading(false);
      });
    }
  }, [isOpen, token]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleMarkRead = async (id: string) => {
    await api.patch(`/notifications/${id}/read`, {}, token || undefined);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await api.post("/notifications/mark-all-read", {}, token || undefined);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-slate-900 dark:text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400">{unreadCount} new</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-brand-400 hover:text-brand-300">
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center">
                <span className="text-2xl">🔔</span>
                <p className="mt-2 text-sm text-slate-500">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex gap-3 border-b border-slate-200/50 dark:border-slate-800/50 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                    !notification.isRead ? "bg-brand-500/5" : ""
                  }`}
                >
                  <span className="mt-0.5 text-sm flex-shrink-0">{typeIcons[notification.type] || "📌"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium ${notification.isRead ? "text-slate-400" : "text-slate-900 dark:text-white"}`}>
                        {notification.title}
                      </p>
                      {!notification.isRead && (
                        <button
                          onClick={() => handleMarkRead(notification.id)}
                          className="flex-shrink-0 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
                          title="Mark as read"
                        >
                          ●
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{notification.message}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] text-slate-600">{timeAgo(notification.createdAt)}</span>
                      <span className="text-[10px] text-slate-700">·</span>
                      <span className={`text-[10px] ${typeColors[notification.type]}`}>{notification.module}</span>
                    </div>
                    {notification.actionUrl && (
                      <a href={notification.actionUrl} className="mt-1 inline-block text-xs text-brand-400 hover:text-brand-300">
                        View details →
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-2">
            <a href="/notifications" className="block text-center text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
              View all notifications
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, Mail, Archive, CheckCheck, RefreshCw, Loader2, Building2, Tag } from "lucide-react";

function tok() {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface Msg {
  id: string;
  name: string;
  email: string;
  company?: string;
  service?: string;
  budget?: string;
  message: string;
  team?: string;
  status: "new" | "read" | "archived";
  at: string;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function MessagesPanel() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "new" | "read" | "archived">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/messages", { headers: { "x-admin-token": tok() } });
      if (r.ok) setMessages((await r.json()).messages || []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: Msg["status"]) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
    try {
      await fetch("/api/admin/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      load();
    }
  };

  const shown = messages.filter((m) => (filter === "all" ? true : m.status === filter));
  const newCount = messages.filter((m) => m.status === "new").length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          <Inbox className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> Messages
          {newCount > 0 && (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "#ef4444", color: "#fff" }}>
              {newCount} new
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {(["all", "new", "read", "archived"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors"
              style={
                filter === f
                  ? { borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)", background: "var(--accent-cyan-muted)" }
                  : { borderColor: "var(--border-primary)", color: "var(--text-tertiary)" }
              }
            >
              {f}
            </button>
          ))}
          <button onClick={load} className="rounded-lg border p-2" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--accent-cyan)" }} />
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border p-8 text-center text-sm" style={{ ...card, color: "var(--text-muted)" }}>
          No {filter === "all" ? "" : filter} messages.
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((m) => (
            <div key={m.id} className="rounded-2xl border p-4" style={card}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
                    {m.name}
                    {m.status === "new" && <span className="h-2 w-2 rounded-full" style={{ background: "#ef4444" }} />}
                  </p>
                  <a href={`mailto:${m.email}`} className="text-sm" style={{ color: "var(--accent-cyan-text)" }}>
                    {m.email}
                  </a>
                </div>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {fmt(m.at)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                {m.company && (
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5" style={{ borderColor: "var(--border-primary)" }}>
                    <Building2 className="h-3 w-3" /> {m.company}
                  </span>
                )}
                {m.service && (
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5" style={{ borderColor: "var(--border-primary)" }}>
                    <Tag className="h-3 w-3" /> {m.service}
                  </span>
                )}
                {m.budget && (
                  <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--border-primary)" }}>
                    {m.budget}
                  </span>
                )}
                {m.team && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}>
                    <Mail className="h-3 w-3" /> routed to {m.team}
                  </span>
                )}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm" style={{ color: "var(--text-secondary)" }}>
                {m.message}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your enquiry to Circuvent")}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <Mail className="h-3.5 w-3.5" /> Reply
                </a>
                {m.status !== "read" && (
                  <button
                    onClick={() => setStatus(m.id, "read")}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
                    style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Mark read
                  </button>
                )}
                {m.status !== "archived" && (
                  <button
                    onClick={() => setStatus(m.id, "archived")}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
                    style={{ borderColor: "var(--border-primary)", color: "var(--text-muted)" }}
                  >
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

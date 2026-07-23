"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Send, CheckCircle2, ChevronDown, MessageCircleQuestion, Trash2, Eye, EyeOff } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface Msg {
  at: string;
  from: "customer" | "admin";
  message: string;
}
interface Ticket {
  id: string;
  email: string;
  name: string;
  subject: string;
  orderNo?: string;
  status: "open" | "closed";
  messages: Msg[];
  updatedAt: string;
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function SupportPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/support", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setTickets(d.tickets || []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-10">
      <ProductQAAdmin />
      <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Support tickets</span> — {tickets.filter((t) => t.status === "open").length} open · {tickets.length} total
        </p>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : tickets.length === 0 ? (
        <p className="py-16 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>No support tickets.</p>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <div key={t.id} className="rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}>
              <button onClick={() => setOpenId(openId === t.id ? null : t.id)} className="flex w-full items-center gap-3 p-4 text-left">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t.subject}</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={t.status === "open" ? { background: "rgba(245,158,11,0.15)", color: "#f59e0b" } : { background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
                      {t.status}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {t.name} · {t.email}{t.orderNo ? ` · ${t.orderNo}` : ""} · {fmt(t.updatedAt)}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 transition-transform" style={{ color: "var(--text-muted)", transform: openId === t.id ? "rotate(180deg)" : "none" }} />
              </button>
              {openId === t.id && <TicketThread ticket={t} onChanged={load} />}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

interface QARow {
  id: string;
  productId: string;
  name: string;
  question: string;
  answer?: string;
  answeredBy?: string;
  at: string;
  published: boolean;
  helpful: number;
}

function ProductQAAdmin() {
  const [rows, setRows] = useState<QARow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/questions", { headers: { "x-admin-token": tok() } });
      if (res.ok) setRows((await res.json()).questions || []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const answer = async (id: string) => {
    const text = drafts[id];
    if (!text || !text.trim()) return;
    setBusy(id);
    await fetch("/api/admin/questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id, answer: text }),
    });
    setDrafts((d) => ({ ...d, [id]: "" }));
    setBusy(null);
    load();
  };
  const togglePublish = async (r: QARow) => {
    await fetch("/api/admin/questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id: r.id, published: !r.published }),
    });
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    await fetch(`/api/admin/questions?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  const unanswered = rows.filter((r) => !r.answer).length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm">
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Product Q&amp;A</span>
          <span style={{ color: "var(--text-tertiary)" }}> — {unanswered} awaiting answer · {rows.length} total</span>
        </p>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>No product questions yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MessageCircleQuestion className="h-4 w-4 shrink-0" style={{ color: "var(--accent-cyan)" }} />
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{r.question}</span>
                  </div>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {r.name} · product {r.productId} · {fmt(r.at)}{!r.published ? " · hidden" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => togglePublish(r)} title={r.published ? "Hide" : "Publish"} style={{ color: "var(--text-muted)" }}>
                    {r.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button onClick={() => remove(r.id)} title="Delete" style={{ color: "#ef4444" }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {r.answer ? (
                <p className="mt-2 rounded-lg border-l-2 pl-3 text-sm" style={{ borderColor: "var(--accent-cyan)", color: "var(--text-secondary)" }}>
                  {r.answer} <span className="text-xs" style={{ color: "var(--text-muted)" }}>— {r.answeredBy}</span>
                </p>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input
                    value={drafts[r.id] || ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && answer(r.id)}
                    placeholder="Write an answer… (notifies the customer)"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
                  />
                  <button onClick={() => answer(r.id)} disabled={busy === r.id} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketThread({ ticket, onChanged }: { ticket: Ticket; onChanged: () => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    await fetch("/api/admin/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id: ticket.id, action: "reply", message: reply }),
    });
    setReply("");
    setBusy(false);
    onChanged();
  };

  const setStatus = async (action: "close" | "open") => {
    await fetch("/api/admin/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id: ticket.id, action }),
    });
    onChanged();
  };

  return (
    <div className="border-t p-4" style={{ borderColor: "var(--border-primary)" }}>
      <div className="space-y-2">
        {ticket.messages.map((m, i) => (
          <div
            key={i}
            className="max-w-[85%] rounded-xl px-3 py-2 text-sm"
            style={
              m.from === "admin"
                ? { marginLeft: "auto", background: "var(--accent-cyan-muted)", color: "var(--text-primary)" }
                : { background: "var(--bg-glass)", color: "var(--text-secondary)" }
            }
          >
            <p>{m.message}</p>
            <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{m.from} · {fmt(m.at)}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a reply… (emails the customer)"
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
        />
        <button onClick={send} disabled={busy} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
        {ticket.status === "open" ? (
          <button onClick={() => setStatus("close")} className="flex shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium" style={{ borderColor: "var(--border-primary)", color: "#10b981" }}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Close
          </button>
        ) : (
          <button onClick={() => setStatus("open")} className="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}

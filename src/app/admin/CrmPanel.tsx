"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, Loader2, MessageSquarePlus, Search, Tag, Users } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface CrmCustomer {
  email: string;
  name: string;
  blocked: boolean;
  orders: number;
  spend: number;
  wallet: number;
  tier: "new" | "bronze" | "silver" | "gold" | "platinum";
  tags: string[];
  noteCount: number;
}
interface CustomerNote {
  id: string;
  author: string;
  note: string;
  at: string;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

const TIER_COLORS: Record<CrmCustomer["tier"], string> = {
  new: "#94a3b8",
  bronze: "#b45309",
  silver: "#94a3b8",
  gold: "#f59e0b",
  platinum: "#a855f7",
};

export default function CrmPanel() {
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [stats, setStats] = useState<{ platinum: number; gold: number; silver: number; bronze: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<CrmCustomer | null>(null);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [tagsText, setTagsText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/crm?q=${encodeURIComponent(q)}`, { headers: { "x-admin-token": tok() } });
    if (res.ok) {
      const d = await res.json();
      setCustomers(d.customers || []);
      setStats(d.stats || null);
    }
    setLoading(false);
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  const openCustomer = async (c: CrmCustomer) => {
    setActive(c);
    setTagsText(c.tags.join(", "));
    const res = await fetch(`/api/admin/crm?email=${encodeURIComponent(c.email)}`, { headers: { "x-admin-token": tok() } });
    if (res.ok) {
      const d = await res.json();
      setNotes(d.notes || []);
    }
  };

  const saveTags = async () => {
    if (!active) return;
    const tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);
    await fetch("/api/admin/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "tags", email: active.email, tags }),
    });
    load();
  };

  const addNote = async () => {
    if (!active || !noteText.trim()) return;
    const res = await fetch("/api/admin/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind: "note", email: active.email, note: noteText }),
    });
    const d = await res.json();
    if (d.success) {
      setNotes((prev) => [d.note, ...prev]);
      setNoteText("");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Users className="w-5 h-5" /> CRM Lite
        </h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Customer tags, notes timeline and lifetime-value tiers.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {(["platinum", "gold", "silver", "bronze"] as const).map((t) => (
            <div key={t} className="rounded-xl p-3" style={card}>
              <div className="text-2xl font-extrabold" style={{ color: TIER_COLORS[t] }}>{stats[t]}</div>
              <div className="text-xs capitalize" style={{ color: "var(--text-tertiary)" }}>{t}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={inputStyle}>
        <Search className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or tag…" className="bg-transparent outline-none text-sm flex-1" style={{ color: "var(--text-primary)" }} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={card}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ borderBottom: "1px solid var(--border-primary)" }}>
                {["Customer", "Tier", "Orders", "Spend", "Tags", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium" style={{ color: "var(--text-tertiary)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.email} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                  <td className="px-4 py-2.5">
                    <div style={{ color: "var(--text-primary)" }}>{c.name || c.email}</div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{c.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize" style={{ background: `${TIER_COLORS[c.tier]}22`, color: TIER_COLORS[c.tier] }}>{c.tier}</span>
                  </td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{c.orders}</td>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-primary)" }}>₹{c.spend.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-glass)", color: "var(--text-secondary)" }}>{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => openCustomer(c)} className="text-xs font-semibold" style={{ color: "var(--accent-cyan)" }}>Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><Award className="w-4 h-4" /> {active.name || active.email}</h3>
              <button onClick={() => setActive(null)} className="text-sm" style={{ color: "var(--text-tertiary)" }}>Close</button>
            </div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>
              <Tag className="w-3 h-3 inline mr-1" /> Tags (comma separated)
            </label>
            <div className="flex gap-2 mb-4">
              <input className={field} style={inputStyle} value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
              <button onClick={saveTags} className="shrink-0 px-3 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save</button>
            </div>
            <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>
              <MessageSquarePlus className="w-3 h-3 inline mr-1" /> Add note
            </label>
            <div className="flex gap-2 mb-4">
              <input className={field} style={inputStyle} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Called about delayed delivery…" />
              <button onClick={addNote} className="shrink-0 px-3 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Add</button>
            </div>
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-glass)" }}>
                  <div style={{ color: "var(--text-primary)" }}>{n.note}</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{n.author} · {new Date(n.at).toLocaleString()}</div>
                </div>
              ))}
              {notes.length === 0 && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No notes yet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

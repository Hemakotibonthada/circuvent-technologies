"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, MessagesSquare, Plus, Trash2, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface Macro { id: string; title: string; body: string; category: string; usageCount: number }

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

export default function MacrosPanel() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<Macro> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/macros", { headers: { "x-admin-token": tok() } });
    if (res.ok) setMacros((await res.json()).macros || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form?.title || !form.body || !form.category) return;
    await fetch("/api/admin/macros", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": tok() }, body: JSON.stringify(form) });
    setForm(null);
    load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/macros?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  const copyUse = async (m: Macro) => {
    if (typeof navigator !== "undefined") navigator.clipboard?.writeText(m.body).catch(() => undefined);
    await fetch("/api/admin/macros", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": tok() }, body: JSON.stringify({ kind: "use", id: m.id }) });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><MessagesSquare className="w-5 h-5" /> Support Macros</h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Canned responses your support team can copy straight into a ticket reply.</p>
        </div>
        <button onClick={() => setForm({ category: "General" })} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}><Plus className="w-4 h-4" /> New macro</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <div className="space-y-3">
          {macros.map((m) => (
            <div key={m.id} className="rounded-xl p-4" style={card}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>{m.title} <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>· {m.category} · used {m.usageCount}×</span></div>
                  <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{m.body}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => copyUse(m)} className="p-1.5 rounded-lg hover:bg-white/10 text-cyan-400" title="Copy & record use"><Copy className="w-4 h-4" /></button>
                  <button onClick={() => remove(m.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
          {macros.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No macros yet.</p>}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold" style={{ color: "var(--text-primary)" }}>New macro</h3><button onClick={() => setForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button></div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Title" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Category" value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <textarea className={field} style={inputStyle} rows={4} placeholder="Response body" value={form.body || ""} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              <button onClick={save} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save macro</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

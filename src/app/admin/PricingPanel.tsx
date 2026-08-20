"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Percent, Plus, Tag, Trash2, X, Zap } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface PriceRule {
  id: string;
  name: string;
  scope: "all" | "category" | "product";
  target?: string;
  discountType: "percent" | "flat";
  value: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  createdAt: string;
}
interface HistEntry {
  id: string;
  ruleName: string;
  action: string;
  at: string;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

function emptyForm(): Partial<PriceRule> {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000);
  return { scope: "all", discountType: "percent", value: 10, active: true, startsAt: now.toISOString().slice(0, 16), endsAt: in7.toISOString().slice(0, 16) };
}

export default function PricingPanel() {
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [history, setHistory] = useState<HistEntry[]>([]);
  const [stats, setStats] = useState<{ totalRules: number; liveNow: number; upcoming: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Partial<PriceRule> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/pricing", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setRules(d.rules || []);
        setHistory(d.history || []);
        setStats(d.stats || null);
      } else {
        setError("Could not load pricing rules. This is a loading failure, not an empty list.");
      }
    } catch {
      setError("Could not load pricing rules. This is a loading failure, not an empty list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form?.name) return;
    await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ ...form, startsAt: new Date(form.startsAt || "").toISOString(), endsAt: new Date(form.endsAt || "").toISOString() }),
    });
    setForm(null);
    load();
  };

  const toggle = async (r: PriceRule) => {
    setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)));
    await fetch("/api/admin/pricing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id: r.id, active: !r.active }),
    });
  };

  const remove = async (r: PriceRule) => {
    if (!confirm(`Delete pricing rule "${r.name}"?`)) return;
    setRules((prev) => prev.filter((x) => x.id !== r.id));
    await fetch(`/api/admin/pricing?id=${encodeURIComponent(r.id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
  };

  const isLive = (r: PriceRule) => {
    const now = Date.now();
    return r.active && now >= new Date(r.startsAt).getTime() && now <= new Date(r.endsAt).getTime();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Percent className="w-5 h-5" /> Pricing Engine
          </h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Schedule flash sales and category-wide discounts without touching base product prices.
          </p>
        </div>
        <button onClick={() => setForm(emptyForm())} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
          <Plus className="w-4 h-4" /> New rule
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-3" style={card}>
            <div className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>{stats.totalRules}</div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Total rules</div>
          </div>
          <div className="rounded-xl p-3" style={card}>
            <div className="text-2xl font-extrabold text-emerald-400">{stats.liveNow}</div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Live now</div>
          </div>
          <div className="rounded-xl p-3" style={card}>
            <div className="text-2xl font-extrabold text-amber-400">{stats.upcoming}</div>
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Upcoming</div>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <div key={r.id} className="rounded-xl p-4 flex items-center justify-between gap-4" style={card}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: isLive(r) ? "#22c55e22" : "var(--bg-glass)", color: isLive(r) ? "#22c55e" : "var(--text-tertiary)" }}>
                  {isLive(r) ? <Zap className="w-4 h-4" /> : <Tag className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{r.name}</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {r.discountType === "percent" ? `${r.value}% off` : `₹${r.value} off`} · {r.scope}{r.target ? `: ${r.target}` : ""} · {new Date(r.startsAt).toLocaleDateString()} → {new Date(r.endsAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggle(r)} className="px-3 py-1 rounded-lg text-xs font-semibold" style={{ background: r.active ? "#22c55e22" : "#94a3b822", color: r.active ? "#22c55e" : "#94a3b8" }}>
                  {r.active ? "Enabled" : "Disabled"}
                </button>
                <button onClick={() => remove(r)} aria-label={`Delete ${r.name}`} className="p-1.5 rounded-lg hover:bg-white/10 text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {rules.length === 0 && !error && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No pricing rules yet.</p>}
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Recent activity</h3>
          <div className="space-y-1.5">
            {history.slice(0, 8).map((h) => (
              <div key={h.id} className="text-xs flex justify-between rounded-lg px-3 py-1.5" style={{ background: "var(--bg-glass)" }}>
                <span style={{ color: "var(--text-secondary)" }}>{h.ruleName} — {h.action}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{new Date(h.at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>New pricing rule</h3>
              <button onClick={() => setForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Rule name (e.g. Diwali Flash Sale)" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <select className={field} style={inputStyle} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as PriceRule["scope"] })}>
                  <option value="all">All products</option>
                  <option value="category">Category</option>
                  <option value="product">Single product</option>
                </select>
                <select className={field} style={inputStyle} value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as PriceRule["discountType"] })}>
                  <option value="percent">% off</option>
                  <option value="flat">₹ off</option>
                </select>
              </div>
              {form.scope !== "all" && (
                <input className={field} style={inputStyle} placeholder={form.scope === "category" ? "Category name" : "Product id"} value={form.target || ""} onChange={(e) => setForm({ ...form, target: e.target.value })} />
              )}
              <input type="number" className={field} style={inputStyle} placeholder="Discount value" value={form.value ?? ""} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Starts
                  <input type="datetime-local" className={field} style={inputStyle} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
                </label>
                <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Ends
                  <input type="datetime-local" className={field} style={inputStyle} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
                </label>
              </div>
              <button onClick={save} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Package, Plus, Trash2, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface BundleWithSavings {
  id: string;
  name: string;
  productIds: string[];
  productNames: string[];
  bundlePrice: number;
  catalogTotal: number;
  savings: number;
  savingsPct: number;
  active: boolean;
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

export default function BundlesPanel() {
  const [bundles, setBundles] = useState<BundleWithSavings[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ name: string; productIds: string; bundlePrice: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/bundles", { headers: { "x-admin-token": tok() } });
    if (res.ok) setBundles((await res.json()).bundles || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form?.name || !form.productIds) return;
    await fetch("/api/admin/bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ name: form.name, productIds: form.productIds.split(",").map((s) => s.trim()).filter(Boolean), bundlePrice: form.bundlePrice }),
    });
    setForm(null);
    load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/bundles?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><Package className="w-5 h-5" /> Product Bundles</h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Combo SKUs priced against live catalog totals — savings calculated automatically.</p>
        </div>
        <button onClick={() => setForm({ name: "", productIds: "", bundlePrice: 0 })} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}><Plus className="w-4 h-4" /> New bundle</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <div className="space-y-3">
          {bundles.map((b) => (
            <div key={b.id} className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap" style={card}>
              <div>
                <div className="font-medium" style={{ color: "var(--text-primary)" }}>{b.name}</div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{b.productNames.join(" + ") || b.productIds.join(", ")}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>₹{b.bundlePrice} (catalog ₹{b.catalogTotal}) · save ₹{b.savings} ({b.savingsPct}%)</div>
              </div>
              <button onClick={() => remove(b.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          {bundles.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No bundles yet.</p>}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold" style={{ color: "var(--text-primary)" }}>New bundle</h3><button onClick={() => setForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button></div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Bundle name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className={field} style={inputStyle} placeholder="Product IDs, comma separated" value={form.productIds} onChange={(e) => setForm({ ...form, productIds: e.target.value })} />
              <input type="number" className={field} style={inputStyle} placeholder="Bundle price ₹" value={form.bundlePrice} onChange={(e) => setForm({ ...form, bundlePrice: Number(e.target.value) })} />
              <button onClick={save} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save bundle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

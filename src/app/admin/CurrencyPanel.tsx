"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, Plus, Trash2, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface CurrencyRate { id: string; code: string; symbol: string; rateFromInr: number; updatedAt: string }

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

export default function CurrencyPanel() {
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<CurrencyRate> | null>(null);
  const [sample, setSample] = useState(1999);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/currency", { headers: { "x-admin-token": tok() } });
    if (res.ok) setRates((await res.json()).rates || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form?.code || !form.symbol || form.rateFromInr === undefined) return;
    await fetch("/api/admin/currency", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": tok() }, body: JSON.stringify(form) });
    setForm(null);
    load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/currency?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><Coins className="w-5 h-5" /> Multi-Currency Pricing</h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Display-only conversion rates for international visitors — checkout still charges in ₹.</p>
        </div>
        <button onClick={() => setForm({ rateFromInr: 0.01 })} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}><Plus className="w-4 h-4" /> New currency</button>
      </div>

      <div className="rounded-xl p-4" style={card}>
        <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>Preview a price (₹)</label>
        <input type="number" className={field} style={{ ...inputStyle, maxWidth: 160 }} value={sample} onChange={(e) => setSample(Number(e.target.value))} />
        <div className="flex flex-wrap gap-3 mt-3">
          {rates.map((r) => (
            <div key={r.id} className="text-sm" style={{ color: "var(--text-secondary)" }}>{r.symbol}{(sample * r.rateFromInr).toFixed(2)} <span style={{ color: "var(--text-tertiary)" }}>{r.code}</span></div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <div className="space-y-2">
          {rates.map((r) => (
            <div key={r.id} className="rounded-xl p-3 flex items-center justify-between" style={card}>
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>{r.code} ({r.symbol}) — 1 INR = {r.rateFromInr} {r.code}</span>
              <button onClick={() => remove(r.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold" style={{ color: "var(--text-primary)" }}>New currency</h3><button onClick={() => setForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button></div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Code (e.g. USD)" value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
              <input className={field} style={inputStyle} placeholder="Symbol (e.g. $)" value={form.symbol || ""} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
              <input type="number" step="0.0001" className={field} style={inputStyle} placeholder="Rate: 1 INR = ? " value={form.rateFromInr ?? ""} onChange={(e) => setForm({ ...form, rateFromInr: Number(e.target.value) })} />
              <button onClick={save} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save currency</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
